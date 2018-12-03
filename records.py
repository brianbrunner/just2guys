from collections import Counter

from memoized_property import memoized_property

from models import *

class Record():

    @memoized_property
    def processed_entries(self):
        entries = self.entries()
        rank = 0
        last_score = None
        last_rank = 0
        for entry in entries:
            rank += 1
            if entry[-1] == last_score:
                entry.insert(0, last_rank)
            else:
                entry.insert(0, rank)
                last_score = entry[-1]
                last_rank = rank
        return entries

class BadBeats(Record):

    def __init__(self):
        self.name = "Bad Beats"
        self.description = "The Top 50 Matchups With The Smallest Margin of Victory"
        self.columns = ["Matchup", "Margin of Victory"]

    def entries(self):
        matchups = Matchup.select()
        entries = [[matchup, round(matchup.margin_of_victory,2)] for matchup in matchups]
        return sorted(entries, key=lambda e: e[1])[:50]

class Demolished(Record):

    def __init__(self):
        self.name = "Demolished"
        self.description = "The Top 50 Matchups With The Highest Margin of Victory"
        self.columns = ["Matchup", "Margin of Victory"]

    def entries(self):
        matchups = Matchup.select()
        entries = [[matchup, round(matchup.margin_of_victory,2)] for matchup in matchups]
        return sorted(entries, key=lambda e: e[1], reverse=True)[:50]

class PostseasonAppearances(Record):

    def __init__(self):
        self.name = "Postseason Appearances"
        self.description = "Manager That Has Made The Post Season The Most Times"
        self.columns = ["Manager", "# Appearances"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, manager.times_made_playoffs] for manager in managers]
        return sorted(entries, key=lambda e: e[1], reverse=True)

class ManagerMostWins(Record):

    def __init__(self):
        self.name = "Most Wins"
        self.description = "Manager With The Most Total Wins"
        self.columns = ["Manager","# Wins"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, manager.wins] for manager in managers]
        return sorted(entries, key=lambda e: e[1], reverse=True)


class ManagerBestRecord(Record):

    def __init__(self):
        self.name = "Best Manager Record"
        self.description = "Manager With The Best Record"
        self.columns = ["Manager","Record"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, round(manager.record, 3)] for manager in managers]
        return sorted(entries, key=lambda e: e[1], reverse=True)


class ManagerFavoritePlayer(Record):

    def __init__(self):
        self.name = "Favorite Players"
        self.description = "The Top 50 Manager/Player Combos That Have Played The Most Games"
        self.columns = ["Manager","Player","Games Played"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, player['player'], player['count']] for manager in managers
            for player in manager.top_active_players]
        return sorted(entries, key=lambda e: e[2], reverse=True)[0:50]

class RealDedication(Record):

    def __init__(self):
        self.name = "Real Dedication"
        self.description = "Top 50 Lowest Points Scored Per Game For Manager/Player Combo (10 or More Games)"
        self.columns = ["Manager", "Player", "Games Played", "Avg. Points"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, player['player'], player['count'],
            round(float(player['points'])/float(player['count']),2)]
            for manager in managers for player in manager.top_active_players if player['count'] >= 10]
        return sorted(entries, key=lambda e: e[3])[0:50]

class Nice(Record):

    def __init__(self):
        self.name = "Nice"
        self.description = "Managers With The Most Scores Of 69 Points"
        self.columns = ["Manager", "Nice"]

    def entries(self):
        managers = Counter()
        matchups = Matchup.select().where(((Matchup.team_a_points>=69)&(Matchup.team_a_points<70))| \
                                          ((Matchup.team_b_points>=69)&(Matchup.team_b_points<70)))
        for matchup in matchups:
            if matchup.team_a_points >= 69 or matchup.team_a_points <= 70:
                for manager in matchup.team_a.managers:
                    managers[manager.id] += 1
            if matchup.team_b_points >= 69 or matchup.team_b_points <= 70:
                for manager in matchup.team_b.managers:
                    managers[manager.id] += 1
        entries = [[Manager.get(Manager.id==manager_id), count] for manager_id, count in managers.most_common()]
        return entries

class PutMeInCoach(Record):

    def __init__(self):
        self.name = "Put Me In, Coach"
        self.description = "Top 50 Most Points Scored By A Non-QB Player On The Bench"
        self.columns = ["Manager", "Team", "Week", "Player", "Points"]

    def entries(self):
        roster_slots = MatchupRosterSlot.select(MatchupRosterSlot, Player).join(Player) \
            .where((MatchupRosterSlot.position=="BN")&(Player.display_position!="QB"))
        entries = [[manager, slot.team, slot.week, slot.player, slot.points] for slot in roster_slots
            for manager in slot.team.managers]
        return sorted(entries, key=lambda e: e[-1], reverse=True)[:50]

class TakeTheHighRoad(Record):

    def __init__(self):
        self.name = "Take The High Road"
        self.description = "Top 50 Highest Scoring Games"
        self.columns = ["Matchup","Total Points"]

    def entries(self):
        matchups = Matchup.select()
        entries = [[matchup, round(matchup.team_a_points+matchup.team_b_points,2)] for matchup in matchups]
        return sorted(entries, key=lambda e: e[-1], reverse=True)[:50]

class TakeTheLowRoad(Record):

    def __init__(self):
        self.name = "Take The Low Road"
        self.description = "Top 50 Lowest Scoring Games"
        self.columns = ["Matchup","Total Points"]

    def entries(self):
        matchups = Matchup.select()
        entries = [[matchup, round(matchup.team_a_points+matchup.team_b_points,2)] for matchup in matchups]
        return sorted(entries, key=lambda e: e[-1])[:50]

class Domination(Record):

    def __init__(self, rivalries):
        self.name = "Domination"
        self.description = "Top 50 Highest Manager vs Manager Records With 3 Or More Games Played"
        self.columns = ["Top Manager", "Bottom Manager", "Wins", "Losses", "Record"]
        self.rivalries = rivalries

    def entries(self):
        entries = [[rivalry['owner'], rivalry['opponent'], rivalry['wins'], rivalry['losses'], round(rivalry['record'],2)]
            for manager_rivalries in self.rivalries.values() for rivalry in manager_rivalries.values()
            if rivalry['wins'] + rivalry['losses'] >= 3]
        return sorted(entries, key=lambda r: r[-1], reverse=True)[0:50]

class TeamBestRecord(Record):
     def __init__(self):
        self.name = "Best Regular Season"
        self.description = "Team With The Most Wins In The Regular Season"
        self.columns = ["Team","Manager","Wins"]
     def entries(self):
        teams = Team.select()
        entries = [[team, team.managers[0], team.regular_season_record['wins']] for team in teams]
        return sorted(entries, key=lambda e: e[2], reverse=True)
