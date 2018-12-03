from collections import defaultdict

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

    class Meta:
        order_by = ['season']

    @property
    def is_league(self):
        # For Jinja Templates
        return True

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

    @property
    def is_player(self):
        # For Jinja Templates
        return True

    @property
    def matchup_slots_by_league(self):
        roster_slots = self.matchup_slots.order_by(MatchupRosterSlot.week)
        slots_by_league = {}
        for slot in roster_slots:
            league = slot.matchup.league
            if league.id not in slots_by_league:
                slots_by_league[league.id] = {
                    'league': league,
                    'slots': [slot]
                }
            else:
                slots_by_league[league.id]['slots'].append(slot)
        return sorted(slots_by_league.values(), key=lambda s: s['league'].season)

class Manager(FootballModel):
    _id = CharField(unique=True)
    nickname = CharField()

    @property
    def is_manager(self):
        # For Jinja Templates
        return True

    @property
    def record(self):
        wins = float(self.wins)
        losses = float(self.losses)
        return wins/(wins+losses)

    @property
    def wins(self):
        return sum([team.wins for team in self.teams])

    @property
    def losses(self):
        return sum([team.losses for team in self.teams])

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

    @property
    def roster_slots(self):
        return [slot for team in self.teams for slot in team.matchup_slots]

    @property
    def top_active_players(self):
        top_players = {}
        for slot in self.roster_slots:
            if slot.position == "BN" or slot.position == "IR":
                continue
            player = slot.player
            if player._id not in top_players:
                top_players[player._id] = {
                    'player': player,
                    'count': 1,
                    'points': slot.points
                }
            else:
                top_players[player._id]['count'] += 1
                top_players[player._id]['points'] += slot.points
        return sorted(top_players.values(), key=lambda p: p['count'], reverse=True)

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

    class Meta:
        order_by = ['league.season']

    @property
    def is_team(self):
        # For Jinja Templates
        return True

    @property
    def ordered_matchups(self):
        return self.matchups.order_by(Matchup.week)

    @property
    def wins(self):
        return self.matchups.where(Matchup.winner_team_key==self.key).count()

    @property
    def losses(self):
        return self.matchups.where(Matchup.winner_team_key!=''&Matchup.winner_team_key!=self.key).count()

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
        losses = len(matchups.where(Matchup.winner_team_key!=self.key&Matchup.winner_team_key!=''))
        return {
            'wins': wins,
            'losses': losses
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

    class Meta:
        order_by = ['week']

    @property
    def is_matchup(self):
        # For Jinja Templates
        return True

    @classmethod
    def all_time_manager_records(cls):
        records = defaultdict(lambda: defaultdict(lambda: {
            'wins': 0,
            'losses': 0,
            'upsets_in_favor': 0,
            'upsets_against': 0,
            'largest_margin_of_victory': None,
            'smallest_margin_of_victory': None,
            'largest_margin_of_defeat': None,
            'smallest_margin_of_defeat': None
        }))
        for matchup in cls.select():
            managers_a = matchup.managers_a
            managers_b = matchup.managers_b
            for manager_a in managers_a:
                for manager_b in managers_b:
                    record_a = records[manager_a.id][manager_b.id]
                    if 'owner' not in record_a:
                        record_a['owner'] = manager_a
                        record_a['opponent'] = manager_b
                        record_b = records[manager_b.id][manager_a.id]
                        record_b['owner'] = manager_b
                        record_b['opponent'] = manager_a
                    if matchup.team_a_win:
                        winner_record = records[manager_a.id][manager_b.id]
                        loser_record = records[manager_b.id][manager_a.id]
                        print(matchup.team_a_projected_points, matchup.team_b_projected_points)
                        if matchup.team_a_projected_points < matchup.team_b_projected_points:
                            winner_record['upsets_in_favor'] += 1
                            loser_record['upsets_against'] += 1
                    else:
                        loser_record = records[manager_a.id][manager_b.id]
                        winner_record = records[manager_b.id][manager_a.id]
                        print(matchup.team_b_projected_points, matchup.team_a_projected_points)
                        if matchup.team_b_projected_points < matchup.team_a_projected_points:
                            winner_record['upsets_in_favor'] += 1
                            loser_record['upsets_against'] += 1
                    winner_record['wins'] += 1
                    loser_record['losses'] += 1
                    margin = abs(matchup.team_a_points - matchup.team_b_points)
                    if winner_record['largest_margin_of_victory'] is None or winner_record['largest_margin_of_victory'] < margin:
                        winner_record['largest_margin_of_victory'] = margin
                    if winner_record['smallest_margin_of_victory'] is None or winner_record['smallest_margin_of_victory'] > margin:
                        winner_record['smallest_margin_of_victory'] = margin
                    if loser_record['largest_margin_of_defeat'] is None or loser_record['largest_margin_of_defeat'] < margin:
                        loser_record['largest_margin_of_defeat'] = margin
                    if loser_record['smallest_margin_of_defeat'] is None or loser_record['smallest_margin_of_defeat'] > margin:
                        loser_record['smallest_margin_of_defeat'] = margin
        return records

    @property
    def ordered_matchup_slots_root_a(self):
        return self.ordered_matchup_slots_by_root_team(root_team=self.team_a)

    @property
    def ordered_matchup_slots_root_b(self):
        return self.ordered_matchup_slots_by_root_team(root_team=self.team_b)

    def ordered_matchup_slots_by_root_team(self, root_team=None):
        if root_team == self.team_b or self.team_b.id == root_team:
            team_a = self.team_b
            team_b = self.team_a
        else:
            team_a = self.team_a
            team_b = self.team_b
        slots = { 'a': [], 'b': [] }
        for slot in self.matchup_slots:
            if slot.team == team_a:
                slots['a'].append(slot)
            else:
                slots['b'].append(slot)
        return [
            sorted(slots['a'], key=lambda s: MatchupRosterSlot.PRIORITY[s.position]),
            sorted(slots['b'], key=lambda s: MatchupRosterSlot.PRIORITY[s.position])
        ]

    @property
    def margin_of_victory(self):
        return abs(self.team_a_points - self.team_b_points)

    @property
    def team_a_win(self):
        return self.team_a.key == self.winner_team_key

    @property
    def team_b_win(self):
        return not self.team_a_win

    @property
    def managers_a(self):
        return self.team_a.managers

    @property
    def managers_b(self):
        return self.team_b.managers

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
    matchup = ForeignKeyField(Matchup, backref='matchup_slots')
    team = ForeignKeyField(Team, backref='matchup_slots')
    player = ForeignKeyField(Player, backref='matchup_slots')
    points = FloatField()
    position = CharField()

    class Meta:
        order_by = ['week']

    PRIORITY = {
        'QB': 1,
        'WR': 2,
        'RB': 3,
        'TE': 4,
        'W/R/T': 5,
        'DEF': 6,
        'K': 7,
        'BN': 8,
        'IR': 9
    }

    @property
    def is_matchup_roster_slot(self):
        # For Jinja Templates
        return True


db.connect()
db.create_tables([League, Player, Manager, Team, Matchup, MatchupRosterSlot, Token,
                  Team.managers.get_through_model(), Team.roster.get_through_model()])
