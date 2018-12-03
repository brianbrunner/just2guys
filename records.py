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

class Demolished(Record):

    def __init__(self):
        self.name = "Demolished"
        self.description = "The Matchups With The Highest Margin of Victory"
        self.columns = ["Matchup", "Margin of Victory"]

    def entries(self):
        matchups = Matchup.select()
        entries = [[matchup, matchup.margin_of_victory] for matchup in matchups]
        return sorted(entries, key=lambda e: e[1], reverse=True)

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
        self.description = "The Top 20 Manager/Player Combos That Have Played The Most Games"
        self.columns = ["Manager","Player","Games Played"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, player['player'], player['count']] for manager in managers
            for player in manager.top_active_players]
        return sorted(entries, key=lambda e: e[2], reverse=True)[0:20]

class RealDedication(Record):

    def __init__(self):
        self.name = "Real Dedication"
        self.description = "Top 20 Lowest Points Scored Per Game For Manager/Player Combo (10 or More Games)"
        self.columns = ["Manager", "Player", "Games Played", "Avg. Points"]

    def entries(self):
        managers = Manager.select()
        entries = [[manager, player['player'], player['count'],
            round(float(player['points'])/float(player['count']),2)]
            for manager in managers for player in manager.top_active_players if player['count'] >= 10]
        return sorted(entries, key=lambda e: e[3])[0:20]

class TeamBestRecord(Record):

    def __init__(self):
        self.name = "Best Regular Season"
        self.description = "Team With The Most Wins In The Regular Season"
        self.columns = ["Team","Manager","Wins"]

    def entries(self):
        teams = Team.select()
        entries = [[team, team.managers[0], team.regular_season_record['wins']] for team in teams]
        return sorted(entries, key=lambda e: e[2], reverse=True)
