#!/usr/bin/env python3

import json
import logging
from xml.etree import ElementTree

import requests
import webbrowser

from models import League, Player, Manager, Team, Matchup, MatchupRosterSlot, Token

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

LEAGUE_IDS = {
    818997,
    721731,
    1060011,
    854870,
    683479
}

class API(object):

    def __init__(self):
        self._consumer_key = 'dj0yJmk9akZmU3V2NWlFcFRJJmQ9WVdrOVZWVlNSRU51TldjbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD00MQ--'
        self._consumer_secret = 'caf913f2ed9fa1038dc9d1f063765cd4b89180ba'
        self._oauth_url = "https://api.login.yahoo.com/oauth2/request_auth?client_id=%s&redirect_uri=oob&response_type=code&language=en-us" % self._consumer_key
        self._base_url = 'https://fantasysports.yahooapis.com/fantasy/v2/'
        self._ns = {'yh': 'http://fantasysports.yahooapis.com/fantasy/v2/base.rng'}

    def _make_req(self, path, method="GET", data={}, headers={}, tree=True):
        headers['Authorization'] = 'Bearer %s' % self._oauth_info['access_token']
        res = requests.request(method, '%s%s' % (self._base_url, path), headers=headers, data=data)
        if tree:
            return ElementTree.fromstring(res.content)
        else:
            return res.content

    def auth(self):
        webbrowser.open(self._oauth_url)
        code = input("Enter your connection code:")
        res = requests.post('https://api.login.yahoo.com/oauth2/get_token', data={
            'client_id': self._consumer_key,
            'client_secret': self._consumer_secret,
            'redirect_uri': 'oob',
            'code': code,
            'grant_type': 'authorization_code'
        })
        self._oauth_info = res.json()

    def get_user_leagues(self):
        tree = self._make_req('users;use_login=1/games;game_key=nfl/leagues')
        league_data = [
            {
                'id': int(league.find('./yh:league_id', self._ns).text),
                'key': league.find('./yh:league_key', self._ns).text,
                'name': league.find('./yh:name', self._ns).text,
                'season': league.find('./yh:season', self._ns).text,
                'current_week': league.find('./yh:current_week', self._ns).text,
                'is_finished': league.find('./yh:is_finished', self._ns) is not None
            } for league in tree.findall(".//yh:league", self._ns)
        ]
        return [League.get_or_create(_id=league['id'], key=league['key'], defaults=league)[0] for league in league_data]

    def get_league_teams(self, league):
        tree = self.get_league_resource(league.key, 'teams')
        return [
            self.process_team(team, league)[0] for team in tree.findall(".//yh:team", self._ns)
        ]

    def get_matchups(self, league):
        return [
            self.get_matchup(league, i) for i in range(1,17)
        ]

    def get_matchup(self, league, week):
        logger.info("Getting matchup info for %s for week %s...", league.key, week)
        tree = self.get_league_resource(league.key, 'scoreboard;week=%s/matchups;/teams;/roster' % week)
        return [
            self.process_matchup(matchup, league) for matchup in tree.findall(".//yh:matchup", self._ns)
        ]

    def get_team_matchups(self, team_key, league):
            tree = self.get_team_resource(team_key, 'matchups')
            return [
                self.process_matchup(matchup, league) for matchup in tree.findall(".//yh:matchup", self._ns)
            ]

    def get_team_rosters(self, team, matchups):
        return [
            self.get_team_roster(team, i+1, matchups[i]) for i in range(0,len(matchups))
        ]

    def get_team_roster(self, team, week, matchup):
        logger.info("Getting roster info for %s for week %s...", team.key, week)
        tree = self.get_team_resource(team.key, 'roster;week=%s;/players/stats' % (week))
        return self.process_roster(tree, team, matchup)

    def process_roster(self, tree, team, matchup):
        return [
            self.process_player(player, team=team, matchup=matchup) for player in tree.findall(".//yh:player", self._ns)
        ]

    def process_player(self, tree, team=None, matchup=None):
        key = tree.find("./yh:player_key", self._ns).text
        id = tree.find("./yh:player_id", self._ns).text
        print(tree.find("./yh:name", self._ns).find("./yh:full", self._ns).text)
        player, created = Player.get_or_create(_id=id, defaults={
            'name': tree.find("./yh:name", self._ns).find("./yh:full", self._ns).text,
            'display_position': tree.find("./yh:display_position", self._ns).text,
            'position_type': tree.find("./yh:display_position", self._ns).text,
            'image_url': tree.find("./yh:image_url", self._ns).text,
        })

        points = None
        selected_position = 'na'
        if tree.find("./yh:player_points", self._ns):
            points = float(tree.find("./yh:player_points", self._ns).find("./yh:total", self._ns).text)
        if (tree.find("./yh:selected_position", self._ns)):
            selected_position = tree.find("./yh:selected_position", self._ns).find("./yh:position", self._ns).text
        print(player.name, selected_position, points)
        if matchup and team:
            MatchupRosterSlot.get_or_create(matchup=matchup, team=team, player=player,
                    points=points, position=selected_position, week=matchup.week)
        return player, points, selected_position

    def get_scoreboard(self, league_key, week):
        tree = self.get_league_resource(league_key, 'scoreboard;week=%s' % week)
        matchups = [
            self.process_matchup(matchup) for matchup in tree.findall(".//yh:matchup", self._ns)
        ]
        return matchups

    def process_team(self, tree, league, add_to_roster=True, week=None):
        id    = tree.find('./yh:team_id', self._ns).text
        key = tree.find('./yh:team_key', self._ns).text
        team, created = Team.get_or_create(_id=id, key=key, defaults={
            'name': tree.find('./yh:name', self._ns).text,
            'logo': [logo.text for logo in tree.find('./yh:team_logos', self._ns).findall('.//yh:url', self._ns)][0],
            'league': league
        })

        if created:
            for manager in tree.findall('./yh:managers', self._ns):
                id = manager.find('.//yh:guid', self._ns).text
                manager, created = Manager.get_or_create(_id=id, defaults={
                    'nickname': manager.find('.//yh:nickname', self._ns).text
                })
                team.managers.add(manager)

        print(tree.findall(".//yh:player", self._ns))
        for player in tree.findall(".//yh:player", self._ns):
            player, points, selected_position = self.process_player(player)
            if add_to_roster:
                team.roster.add(player)
            if week and selected_position:
                print(player.name, team.name, week, selected_position)
                slot = MatchupRosterSlot.select().where(MatchupRosterSlot.week==week, MatchupRosterSlot.team==team, MatchupRosterSlot.player==player).get()
                slot.position = selected_position
                slot.save()

        projected_points = None
        points = None
        if tree.find('./yh:team_projected_points', self._ns):
            projected_points = float(tree.find('./yh:team_projected_points', self._ns).find('./yh:total', self._ns).text)
        if tree.find('./yh:team_points', self._ns):
            points = float(tree.find('./yh:team_points', self._ns).find('./yh:total', self._ns).text)
        return team, projected_points, points

    def process_matchup(self, tree, league):
        week = tree.find('./yh:week', self._ns).text
        teams = [
            self.process_team(team, league, add_to_roster=False, week=week) for team in tree.findall('.//yh:team', self._ns)
        ]
        teams = sorted(teams, key=lambda team: team[0].name)
        key = '%s.%s.%s' % (league.key, week, '.'.join(sorted([teams[0][0].key, teams[1][0].key])))
        matchup, created = Matchup.get_or_create(key=key, defaults={
            'team_a': teams[0][0],
            'team_a_projected_points': teams[0][1],
            'team_a_points': teams[0][2],
            'team_b': teams[1][0], 
            'team_b_projected_points': teams[0][1],
            'team_b_points': teams[0][2],
            'week': week,
            'is_playoffs': tree.find('./yh:is_playoffs', self._ns).text == '1',
            'is_consolation': tree.find('./yh:is_consolation', self._ns).text == '1',
            'winner_team_key': tree.find('./yh:winner_team_key', self._ns).text,
            'league': league
        })
        return matchup

    def get_league_resource(self, league_key, resource):
        return self._make_req('league/%s/%s' % (league_key, resource))

    def get_team_resource(self, team_key, resource):
        return self._make_req('team/%s/%s' % (team_key, resource))

if __name__ == "__main__":
    api = API()
    api.auth()

    logger.info("Fetching leagues...")

    leagues = api.get_user_leagues()
    leagues = filter(lambda l: int(l._id) in LEAGUE_IDS, leagues)
    league_infos = []

    for league in leagues:
        logger.info("Fetching teams for league %s (%s)...", league.name, league.season)

        league_info = {
            "name": league.name,
            "key": league.key
        }

        teams = api.get_league_teams(league)
        teams_dict = {
            team._id: team
            for team in teams
        }

        for team in teams:
            logger.info("Fetching matchup info for team %s in league %s (%s)...", team.name, league.name, league.season)
            matchups = api.get_team_matchups(team.key, league)
            logger.info("Fetching roster info for team %s in league %s (%s)...", team.name, league.name, league.season)
            rosters = api.get_team_rosters(team, matchups)
