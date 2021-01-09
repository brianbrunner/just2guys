from collections import defaultdict
import pdb

from peewee import *

db = SqliteDatabase('football.db')


class FootballModel(Model):

    class Meta:
        database = db

    @classmethod
    def update_or_create(cls, **kwargs):
        obj, created = cls.get_or_create(**kwargs)
        if not created:
            defaults = kwargs.get('defaults', None)
            if defaults is not None:
                for key, value in defaults.items():
                    setattr(obj, key, value)
                obj.save()
        return obj, created


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
    def is_multi_league(self):
        return any([team.group == 'B' for team in self.teams])

    @property
    def regular_season_standings(self):
        standings = [
            {
                'wins': team.regular_season_record['wins'],
                'points_for': team.regular_season_points,
                'points_against': team.regular_season_points_against,
                'team': team
            } for team in self.teams
        ]
        return self.sort_standings(standings)

    @property
    def finals_winners(self):
        return self.matchups.where((Matchup.week==16)&(Matchup.is_playoffs==True))

    @property
    def consolation(self):
        return self.matchups.where((Matchup.week==16)&(Matchup.is_consolation==True))

    @property
    def finals_losers(self):
        return self.matchups.where((Matchup.week==16)&(Matchup.is_losers==True))

    @property
    def semifinals_winners(self):
        return self.matchups.where((Matchup.week==15)&(Matchup.is_playoffs==True))

    @property
    def semifinals_losers(self):
        return self.matchups.where((Matchup.week==15)&(Matchup.is_losers==True))

    @property
    def quarterfinals_winners(self):
        return self.matchups.where((Matchup.week==14)&(Matchup.is_playoffs==True))

    @property
    def quarterfinals_losers(self):
        return self.matchups.where((Matchup.week==14)&(Matchup.is_losers==True))

    def build_matchups_from_standings(self, standings, bracket_orders, is_playoffs=True):
        standings = list(standings)
        bracket_movement = 2
        while len(standings) > 0:
            best = standings.pop(0)
            worst = standings.pop()
            matchup_a = self.matchups.where((Matchup.week==14)&(Matchup.team_a==best['team']))
            matchup_b = self.matchups.where((Matchup.week==14)&(Matchup.team_a==worst['team']))
            if len(matchup_a) > 0 and len(matchup_b) > 0:
                combined_matchup = matchup_a[0].merge_into(matchup_b[0])
                combined_matchup.bracket_order = bracket_orders.pop(0)
                if is_playoffs:
                    combined_matchup.is_playoffs = True
                else:
                    combined_matchup.is_losers = True
                combined_matchup.save()

    def merge_matchups(self, team_a, team_b, week, bracket_order, is_playoffs=True, is_consolation=False):
        matchup_a = self.matchups.where((Matchup.week==week)&(Matchup.team_a==team_a))
        matchup_b = self.matchups.where((Matchup.week==week)&(Matchup.team_a==team_b))
        # We only need to combine matchups if we haven't do so already
        if len(matchup_a) > 0 and len(matchup_b) > 0:
            combined_matchup = matchup_a[0].merge_into(matchup_b[0])
            combined_matchup.bracket_order = bracket_order
            if is_playoffs:
                combined_matchup.is_playoffs = True
            elif is_consolation:
                combined_matchup.is_consolation = True
            else:
                combined_matchup.is_losers = True
            combined_matchup.save()

    def mark_as_bye(self, team, week):
        matchup = self.matchups.where((Matchup.week==week)&(Matchup.team_a==team))[0]
        matchup.is_bye = True
        matchup.save()

    def build_playoffs(self):

        for team in self.teams:
            team.playoff_seed = None
            team.save()

        # Week 14 Things

        if self.current_week < 14 or self.matchups.count() == 0:
            return

        week_14_matchups = self.matchups.where(Matchup.week==14)
        unmatched_week_14_matchups = week_14_matchups.where((Matchup.team_b.is_null())&(Matchup.is_bye==False))
        loser_byes = None
        winners = []
        losers = []
        if len(unmatched_week_14_matchups) > 0:
            standings = self.regular_season_standings
            if self.is_multi_league:
                standings_a = list(filter(lambda e: e['team'].group == 'A', standings))
                for i, e in enumerate(standings_a):
                    team = e['team']
                    team.playoff_seed = i + 1
                    team.save()
                winners_a = standings_a[:4]
                self.build_matchups_from_standings(winners_a, [1,2])
                losers_a = standings_a[4:]
                self.build_matchups_from_standings(losers_a, [5,6], is_playoffs=False)

                standings_b = list(filter(lambda e: e['team'].group == 'B', standings))
                for i, e in enumerate(standings_b):
                    team = e['team']
                    team.playoff_seed = i + 1
                winners_b = standings_b[:4]
                self.build_matchups_from_standings(winners_b, [3,4])
                losers_b = standings_b[4:]
                self.build_matchups_from_standings(losers_b, [7,8], is_playoffs=False)

            else:
                for i, e in enumerate(standings):
                    team = e['team']
                    team.playoff_seed = i + 1
                    team.save()
                winners = standings[:8]
                self.build_matchups_from_standings(winners, [1,4,3,2])

                losers = standings[8:]
                if len(losers) != 8:
                    loser_byes = [loser['team'] for loser in losers[4:]]
                    for loser in loser_byes:
                        self.mark_as_bye(loser, 14)
                    losers = losers[:4]
                self.build_matchups_from_standings(losers, [5,8,7,6], is_playoffs=False)

        matched_week_14_matchups = week_14_matchups.where(Matchup.team_b.is_null(False))

        for matchup in matched_week_14_matchups:
            matchup.calculate_points()

        if self.current_week > 14:
            for matchup in matched_week_14_matchups:
                matchup.finalize()

        # Week 15 things

        if self.current_week < 15:
            return

        matched_week_15_matchups = self.matchups.where((Matchup.week==15)&(Matchup.team_b.is_null(False)))
        if len(matched_week_15_matchups) == 0:
            bracket_ordered_week_14_matchups = matched_week_14_matchups.order_by(Matchup.bracket_order)
            winners = [matchup.winner for matchup in bracket_ordered_week_14_matchups.where(Matchup.is_playoffs==True)]
            losers = [matchup.loser for matchup in bracket_ordered_week_14_matchups.where(Matchup.is_losers==True)]
            if loser_byes is not None:
                losers = [
                    losers[0],
                    loser_byes[1],
                    losers[1],
                    loser_byes[0],
                ]
            self.merge_matchups(winners[0], winners[1], 15, 0)
            self.merge_matchups(winners[2], winners[3], 15, 1)
            self.merge_matchups(losers[0], losers[1], 15, 2, is_playoffs=False)
            self.merge_matchups(losers[2], losers[3], 15, 3, is_playoffs=False)

        matched_week_15_matchups = self.matchups.where((Matchup.week==15)&(Matchup.team_b.is_null(False)))

        for matchup in matched_week_15_matchups:
            matchup.calculate_points()

        if self.current_week > 15:
            for matchup in matched_week_15_matchups:
                matchup.finalize()

        # Week 16 things

        if self.current_week < 16:
            return

        matched_week_16_matchups = self.matchups.where((Matchup.week==16)&(Matchup.team_b.is_null(False)))
        if len(matched_week_16_matchups) == 0:
            bracket_ordered_week_15_matchups = matched_week_15_matchups.order_by(Matchup.bracket_order)
            winners = [matchup.winner for matchup in bracket_ordered_week_15_matchups.where(Matchup.is_playoffs==True)]
            consolations = [matchup.loser for matchup in bracket_ordered_week_15_matchups.where(Matchup.is_playoffs==True)]
            losers = [matchup.loser for matchup in bracket_ordered_week_15_matchups.where(Matchup.is_losers==True)]
            self.merge_matchups(winners[0], winners[1], 16, 0)
            self.merge_matchups(consolations[0], consolations[1], 16, 1, is_playoffs=False, is_consolation=True)
            self.merge_matchups(losers[0], losers[1], 16, 2, is_playoffs=False)

        matched_week_16_matchups = self.matchups.where((Matchup.week==16)&(Matchup.team_b.is_null(False)))

        for matchup in matched_week_16_matchups:
            matchup.calculate_points()

        if self.is_finished:
            for matchup in matched_week_16_matchups:
                matchup.finalize()

    def reset_playoffs(self):
        for matchup in self.matchups.where((Matchup.week<<[14,15,16])&(Matchup.team_b.is_null(False))):
            matchup.decouple()

    def merge_into(self, league):
        for team in self.teams:
            team.group = "B"
            team.league = league
            team.save()
        for matchup in self.matchups:
            matchup.league = league
            matchup.save()

    def sort_standings(self, standings):
        return sorted(standings, key=lambda t: (t['team'].group, t['wins'], t['points_for'], -t['points_against']), reverse=True) 

    def ranked_teams(self):
        return sorted(list(self.teams), key=lambda t: t.wins)

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

    @classmethod
    def cleanup(cls):
        # Emilio
        cls.merge_by_ids("G627P5CQWWO422R6W5G7URKSGA", "PY6UUO3OEPLOEBK646MPD6N6S4")
        cls.merge_by_ids("G627P5CQWWO422R6W5G7URKSGA", "JUMDMQHVI26TTWEZYSRHUO2KVQ")

        # Manoli
        cls.merge_by_ids("P7IBQBPT7QSQRBCUCQDBEJNVGE", "KROJHUKXDL4LHBDCIRCBKCIXGY")

        cls.rename("3YAWEDYUCRQ5O6MOKWG75XIO74", "Brian K")
        cls.rename("AZKFFOK2V7WIYF6BQVYPK6PKOA", "Brian B")

    @classmethod
    def merge_by_ids(cls, id1, id2):
        m1 = cls.select().where(Manager._id==id1)[0]
        m2 = cls.select().where(Manager._id==id2)
        if m2.exists():
            m1.merge(m2[0])

    @classmethod
    def rename(cls, _id, name):
        m = cls.select().where(Manager._id==_id)[0]
        m.nickname = name
        m.save()

    @property
    def is_manager(self):
        # For Jinja Templates
        return True

    @property
    def record(self):
        wins = float(self.wins)
        losses = float(self.losses)
        if losses + wins == 0:
            return 0
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
    group = CharField(default="A")
    playoff_seed = IntegerField(null=True)

    class Meta:
        order_by = ['league.season']

    @property
    def is_team(self):
        # For Jinja Templates
        return True

    @property
    def ordered_matchups(self):
        return self.finalized_matchups.order_by(Matchup.week)

    @property
    def finalized_matchups(self):
        return self.matchups.where(Matchup.winner_team_key.is_null(False))

    @property
    def points_for(self):
        return sum([matchup.info_for_team(self)['points'] for matchup in self.finalized_matchups])

    @property
    def points_against(self):
        return sum([matchup.info_for_opponent(self)['points'] for matchup in self.finalized_matchups])

    @property
    def wins(self):
        return self.matchups.where(Matchup.winner_team_key==self.key).count()

    @property
    def regular_season_wins(self):
        return self.matchups.where((Matchup.week<=13)&(Matchup.winner_team_key==self.key)).count()

    @property
    def losses(self):
        return self.matchups.where((Matchup.winner_team_key!='')&(Matchup.winner_team_key.is_null(False))&(Matchup.winner_team_key!=self.key)).count()

    @property
    def regular_season_losses(self):
        return self.matchups.where((Matchup.week<=13)&(Matchup.winner_team_key!='')&(Matchup.winner_team_key.is_null(False))&(Matchup.winner_team_key!=self.key)).count()

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
        return [(matchup, matchup.info_for_team(self), matchup.info_for_opponent(self)) for matchup in self.regular_season_matchups]

    @property
    def regular_season_projected_points(self):
        return sum([entry[1]['projected_points'] for entry in self.regular_season_matchups_with_infos])

    @property
    def regular_season_points(self):
        return sum([entry[1]['points'] for entry in self.regular_season_matchups_with_infos])

    @property
    def regular_season_points_against(self):
        return sum([entry[2]['points'] for entry in self.regular_season_matchups_with_infos])

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
    league = ForeignKeyField(League, backref='matchups')
    week = IntegerField()
    is_playoffs = BooleanField(default=False)
    is_consolation = BooleanField(default=False)
    is_bye = BooleanField(default=False)
    is_losers = BooleanField(default=False)
    bracket_order = IntegerField(null=True)
    winner_team_key = CharField(null=True)
    team_a = ForeignKeyField(Team)
    team_a_projected_points = FloatField(null=True)
    team_a_points = FloatField()
    team_b = ForeignKeyField(Team, null=True)
    team_b_projected_points = FloatField(null=True)
    team_b_points = FloatField(null=True)

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
            'smallest_margin_of_defeat': None,
            'matchups': []
        }))
        for matchup in cls.select().where(Matchup.winner_team_key.is_null(False)):
            if matchup.winner_team_key == '':
                continue
            managers_a = matchup.managers_a
            managers_b = matchup.managers_b
            for manager_a in managers_a:
                for manager_b in managers_b:
                    record_a = records[manager_a.id][manager_b.id]
                    record_b = records[manager_b.id][manager_a.id]
                    if 'owner' not in record_a:
                        record_a['owner'] = manager_a
                        record_a['opponent'] = manager_b
                    if 'owner' not in record_b:
                        record_b['owner'] = manager_b
                        record_b['opponent'] = manager_a
                    record_a['matchups'].append(matchup)
                    record_b['matchups'].append(matchup)
                    if matchup.team_a_win:
                        winner_record = records[manager_a.id][manager_b.id]
                        loser_record = records[manager_b.id][manager_a.id]
                        if matchup.team_a_projected_points is not None and matchup.team_a_projected_points < matchup.team_b_projected_points:
                            winner_record['upsets_in_favor'] += 1
                            loser_record['upsets_against'] += 1
                    else:
                        loser_record = records[manager_a.id][manager_b.id]
                        winner_record = records[manager_b.id][manager_a.id]
                        if matchup.team_a_projected_points is not None and matchup.team_b_projected_points < matchup.team_a_projected_points:
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
        for record in records.values():
            for subrecord in record.values():
                subrecord['matchups'] = sorted(subrecord['matchups'], key=lambda m: (matchup.league.season, matchup.week))
                wins = subrecord['wins']
                losses = subrecord['losses']
                subrecord['record'] = float(wins)/float(wins+losses)
        return records

    @property
    def ordered_matchup_slots_root_a(self):
        return self.ordered_matchup_slots_by_root_team(root_team=self.team_a)

    @property
    def ordered_matchup_slots_root_b(self):
        return self.ordered_matchup_slots_by_root_team(root_team=self.team_b)

    @property
    def winner(self):
        if self.winner_team_key == self.team_a.key:
            return self.team_a
        elif self.winner_team_key == self.team_b.key:
            return self.team_b
        else:
            return None

    @property
    def loser(self):
        if self.winner_team_key == self.team_a.key:
            return self.team_b
        elif self.winner_team_key == self.team_b.key:
            return self.team_a
        else:
            return None

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
        return self.team_b.key == self.winner_team_key

    @property
    def managers_a(self):
        return self.team_a.managers

    @property
    def managers_b(self):
        return self.team_b.managers

    @property
    def roster_slots(self):
        return MatchupRosterSlot.select().where(MatchupRosterSlot.matchup==self)

    def merge_into(self, matchup):
        team_infos = [
            {
                'team': self.team_a,
                'projected_points': self.team_a_projected_points,
                'points': self.team_a_points,
            },
            {
                'team': matchup.team_a,
                'projected_points': matchup.team_a_projected_points,
                'points': matchup.team_a_points,
            }
        ]
        sorted_team_infos = sorted(team_infos, key=lambda info: info['team'].name)
        team_a = sorted_team_infos[0]
        team_b = sorted_team_infos[1]
        key = '%s.%s.%s.%s' % (self.league.key, self.week, team_a['team'].key, team_b['team'].key)
        self.key = key
        self.team_a = team_a['team']
        self.team_a_projected_points = team_a['projected_points']
        self.team_a_points = team_a['points']
        self.team_b = team_b['team']
        self.team_b_projected_points = team_b['projected_points']
        self.team_b_points = team_b['points']
        for slot in matchup.matchup_slots:
            slot.matchup = self
            slot.save()
        matchup.delete_instance()
        self.save()
        return self

    def decouple(self):

        # Generate new matchup for B team
        new_matchup = Matchup(
            key="%s.%s.%s.unmatched" % (self.league.key, self.week, self.team_b.key),
            league=self.league,
            week=self.week,
            team_a=self.team_b,
            team_a_points=self.team_b_points,
            team_a_projected_points=self.team_b_projected_points,
        )
        new_matchup.save()
        for slot in self.matchup_slots.where(MatchupRosterSlot.team==self.team_b):
            slot.matchup = new_matchup
            slot.save()

        # reset state for self
        self.key = "%s.%s.%s.unmatched" % (self.league.key, self.week, self.team_a.key),
        self.team_b = None
        self.team_b_points = None
        self.team_b_projected_points = None
        self.is_bye = False
        self.is_playoffs = False
        self.is_losers = False
        self.is_consolation = False
        self.winner_team_key = None
        self.save()

    def calculate_points(self):
        self.team_a_points = 0.0
        self.team_b_points = 0.0
        for slot in self.matchup_slots.where(MatchupRosterSlot.position!='BN'):
            if slot.team == self.team_a:
                self.team_a_points += slot.points
            else:
                self.team_b_points += slot.points
        self.save()

    def finalize(self):
        if self.team_a_points > self.team_b_points:
            self.winner_team_key = self.team_a.key
        else:
            self.winner_team_key = self.team_b.key
        self.save()


    def info_for_opponent(self, team):
        if team == self.team_a:
            return self.info_for_team(self.team_b)
        elif team == self.team_b:
            return self.info_for_team(self.team_a)
        else:
            raise Exception("That team is not part of this matchup")

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
