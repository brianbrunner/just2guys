from peewee import *

db = SqliteDatabase('football.db')


class FootballModel(Model):

    class Meta:
        database = db


class Token(FootballModel):
    token = CharField()


class League(FootballModel):
    _id = CharField()
    key = CharField(unique=True)
    name = CharField()
    season = IntegerField()
    current_week = IntegerField()
    is_finished = BooleanField()

    @property
    def regular_season_standings(self):
        standings = [
            {
                'wins': team.regular_season_record['wins'],
                'points': team.regular_season_points,
                'team': team
            } for team in self.teams
        ]
        return sorted(standings, key=lambda t: (t['wins'], t['points']), reverse=True)


class Player(FootballModel):
    _id = CharField()
    name = CharField()
    display_position = CharField()
    position_type = CharField()
    image_url = CharField()


class Manager(FootballModel):
    _id = CharField(unique=True)
    nickname = CharField()

    @property
    def times_made_playoffs(self):
        return sum([1 if team.made_playoffs else 0 for team in self.teams])

    @property
    def regular_season_player_stats(self):
        stats = [team.regular_season_player_stats for team in self.teams]
        players = stats[0]
        for team_stats in stats[1:]:
            for player_id, player_stats in team_stats.items(): 
                if player_id not in players:
                    players[player_id] = player_stats
                else:
                    for key, value in player_stats.items():
                        if key == 'player':
                            continue
                        players[player_id][key] += value
        return players

    @property
    def regular_season_projection_error(self):
        teams = self.teams
        projection_errors = { '%s (%s)' % (team.name, team.league.season): team.regular_season_projection_error for team in teams }
        total_error = sum(projection_errors.values())
        num_teams = len(projection_errors)
        return {
            'average': total_error/num_teams,
            'total_error': total_error,
            'num_teams': num_teams,
            'teams': projection_errors
        }

    def merge(self, manager):
        for team in manager.teams:
            team.managers.remove(manager)
            team.managers.add(self)
            team.save()
        manager.delete_instance()


class Team(FootballModel):
    _id = CharField()
    key = CharField(unique=True)
    name = CharField()
    logo = CharField()
    managers = ManyToManyField(Manager, backref='teams')
    roster = ManyToManyField(Player, backref='teams')
    league = ForeignKeyField(League, backref='teams')

    @property
    def made_playoffs(self):
        return self.matchups.where(Matchup.week>13).exists()

    @property
    def matchups(self):
        return Matchup.select().where((Matchup.team_a==self)|(Matchup.team_b==self))

    @property
    def regular_season_matchups(self):
        return self.matchups.where(Matchup.week<=13)

    @property
    def regular_season_rank(self):
        return [entry['team'] for entry in self.league.regular_season_standings].index(self)+1

    @property
    def regular_season_record(self):
        matchups = self.regular_season_matchups
        wins = len(matchups.where(Matchup.winner_team_key==self.key))
        return {
            'wins': wins,
            'losses': len(matchups) - wins
        }

    @property
    def regular_season_matchups_with_infos(self):
        return [(matchup, matchup.info_for_team(self)) for matchup in self.regular_season_matchups]

    @property
    def regular_season_projected_points(self):
        return sum([entry[1]['projected_points'] for entry in self.regular_season_matchups_with_infos])

    @property
    def regular_season_points(self):
        return sum([entry[1]['points'] for entry in self.regular_season_matchups_with_infos])

    @property
    def regular_season_projection_error(self):
        return self.regular_season_points - self.regular_season_projected_points

    @property
    def regular_season_player_stats(self):
        entries = self.regular_season_matchups_with_infos
        players = {}
        for entry in entries:
            info = entry[1]
            for roster_slot in info['roster']:
                if roster_slot.player.id not in players:
                    players[roster_slot.player.id] = {
                        'player': roster_slot.player,
                        'active_games': 0,
                        'bench_games': 0,
                        'ir_games': 0,
                        'points': 0,
                        'bench_points': 0
                    }
                if roster_slot.position == "BN":
                    players[roster_slot.player.id]['bench_games'] += 1
                    players[roster_slot.player.id]['bench_points'] += roster_slot.points
                elif roster_slot.position == "IR":
                    players[roster_slot.player.id]['ir_games'] += 1
                else:
                    players[roster_slot.player.id]['active_games'] += 1
                    players[roster_slot.player.id]['points'] += roster_slot.points
        return players

class Matchup(FootballModel):
    key = CharField(unique=True)
    league = ForeignKeyField(League)
    week = IntegerField()
    is_playoffs = BooleanField()
    is_consolation = BooleanField()
    winner_team_key = CharField()
    team_a = ForeignKeyField(Team)
    team_a_projected_points = FloatField()
    team_a_points = FloatField()
    team_b = ForeignKeyField(Team)
    team_b_projected_points = FloatField()
    team_b_points = FloatField()

    @property
    def roster_slots(self):
        return MatchupRosterSlot.select().where(MatchupRosterSlot.matchup==self)

    def info_for_team(self, team):
        if team == self.team_a:
            return {
                "projected_points": self.team_a_projected_points,
                "points": self.team_a_points,
                "won": self.winner_team_key == team.key,
                "roster": self.roster_slots.where(MatchupRosterSlot.team==team)
            }
        elif team == self.team_b:
            return {
                "projected_points": self.team_b_projected_points,
                "points": self.team_b_points,
                "won": self.winner_team_key == team.key,
                "roster": self.roster_slots.where(MatchupRosterSlot.team==team)
            }
        else:
            raise Exception("That team is not part of this matchup")

class MatchupRosterSlot(FootballModel):
    week = IntegerField()
    matchup = ForeignKeyField(Matchup)
    team = ForeignKeyField(Team, backref='matchup_slots')
    player = ForeignKeyField(Player)
    points = FloatField()
    position = CharField()


db.connect()
db.create_tables([League, Player, Manager, Team, Matchup, MatchupRosterSlot, Token,
                  Team.managers.get_through_model(), Team.roster.get_through_model()])
