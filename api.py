#!/usr/bin/env python3

import json
import logging
from xml.etree import ElementTree

import requests
import webbrowser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

LEAGUE_IDS = {
  '818997',
  '721731',
  '1060011',
  '854870',
  '683479'
}

class API(object):

  def __init__(self):
    self._consumer_key = 'dj0yJmk9akZmU3V2NWlFcFRJJmQ9WVdrOVZWVlNSRU51TldjbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD00MQ--'
    self._consumer_secret = 'caf913f2ed9fa1038dc9d1f063765cd4b89180ba'
    self._oauth_url = "https://api.login.yahoo.com/oauth2/request_auth?client_id=%s&redirect_uri=oob&response_type=code&language=en-us" % self._consumer_key
    self._base_url = 'https://fantasysports.yahooapis.com/fantasy/v2/'
    self._ns = {'yh': 'http://fantasysports.yahooapis.com/fantasy/v2/base.rng'}

  def _make_req(self, path, method="GET", data={}, headers={}):
    headers['Authorization'] = 'Bearer %s' % self._oauth_info['access_token']
    res = requests.request(method, '%s%s' % (self._base_url, path), headers=headers, data=data)
    return ElementTree.fromstring(res.content)

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
    return [
      {
        'id': league.find('./yh:league_id', self._ns).text,
        'key': league.find('./yh:league_key', self._ns).text,
        'name': league.find('./yh:name', self._ns).text,
        'season': league.find('./yh:season', self._ns).text,
        'current_week': league.find('./yh:current_week', self._ns).text,
        'is_finished': league.find('./yh:is_finished', self._ns) is not None
      } for league in tree.findall(".//yh:league", self._ns)
    ]

  def get_league_teams(self, league_key):
    tree = self.get_league_resource(league_key, 'teams')
    return [
      self.process_team(team) for team in tree.findall(".//yh:team", self._ns)
    ]

  def get_matchups(self, league_key):
    return [
      self.get_matchup(league_key, i) for i in range(1,17)
    ]

  def get_matchup(self, league_key, week):
    logger.info("Getting matchup info for %s for week %s...", league_key, week)
    tree = self.get_league_resource(league_key, 'scoreboard;week=%s/matchups;/teams;/roster' % week)
    return [
      self.process_matchup(matchup) for matchup in tree.findall(".//yh:matchup", self._ns)
    ]

  def get_team_matchups(self, team_key):
      tree = self.get_team_resource(team_key, 'matchups')
      return [
        self.process_matchup(matchup) for matchup in tree.findall(".//yh:matchup", self._ns)
      ]

  def get_team_rosters(self, team_key):
    return [
      self.get_team_roster(team_key, i) for i in range(1,17)
    ]

  def get_team_roster(self, team_key, week):
    logger.info("Getting roster info for %s for week %s...", team_key, week)
    tree = self.get_team_resource(team_key, 'players;week=%s/stats;type=week;week=%s' % (week, week))
    return self.process_roster(tree)

  def process_roster(self, tree):
    return [
      self.process_player(player) for player in tree.findall(".//yh:player", self._ns)
    ]

  def process_player(self, tree):
    player = {
      'key': tree.find("./yh:player_key", self._ns).text,
      'id': tree.find("./yh:player_id", self._ns).text,
      'name': tree.find("./yh:name", self._ns).find("./yh:full", self._ns).text,
      'display_position': tree.find("./yh:display_position", self._ns).text,
      'position_type': tree.find("./yh:display_position", self._ns).text,
      'image_url': tree.find("./yh:image_url", self._ns).text,
    }
    if tree.find("./yh:player_points", self._ns):
      player['points'] = float(tree.find("./yh:player_points", self._ns).find("./yh:total", self._ns).text)
    if (tree.find("./yh:selected_position", self._ns)):
      player['selected_position'] = tree.find("./yh:selected_position", self._ns).find("./yh:position", self._ns).text
    return player

  def get_scoreboard(self, league_key, week):
    tree = self.get_league_resource(league_key, 'scoreboard;week=%s' % week)
    matchups = [
      self.process_matchup(matchup) for matchup in tree.findall(".//yh:matchup", self._ns)
    ]
    return matchups

  def process_team(self, tree):
    team = {
      'id': tree.find('./yh:team_id', self._ns).text,
      'key': tree.find('./yh:team_key', self._ns).text,
      'name': tree.find('./yh:name', self._ns).text,
      'logos': [logo.text for logo in tree.find('./yh:team_logos', self._ns).findall('.//yh:url', self._ns)],
      'managers': [
        {
          'id': manager.find('.//yh:manager_id', self._ns).text,
          'nickname': manager.find('.//yh:nickname', self._ns).text
        } for manager in tree.findall('./yh:managers', self._ns)
      ],
      'roster': [
        self.process_player(player) for player in tree.findall(".//yh:player", self._ns)
      ]
    }
    if tree.find('./yh:team_projected_points', self._ns):
      team['projected_points'] = float(tree.find('./yh:team_projected_points', self._ns).find('./yh:total', self._ns).text)
    if tree.find('./yh:team_points', self._ns):
      team['team_points'] = float(tree.find('./yh:team_points', self._ns).find('./yh:total', self._ns).text)
    return team

  def process_matchup(self, tree):
    matchup = {
      'week': tree.find('./yh:week', self._ns).text,
      'is_playoffs': tree.find('./yh:is_playoffs', self._ns).text == '1',
      'is_consolation': tree.find('./yh:is_consolation', self._ns).text == '1',
      'winner_team_key': tree.find('./yh:winner_team_key', self._ns).text,
      'teams': [
        self.process_team(team) for team in tree.findall('.//yh:team', self._ns)
      ]
    }
    matchup['key'] = '%s.%s' % (matchup['week'], '.'.join(sorted([matchup['teams'][0]['key'], matchup['teams'][1]['key']])))
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
  leagues = filter(lambda l: l['id'] in LEAGUE_IDS, leagues)
  league_infos = []

  for league in leagues:

    logger.info("Fetching teams for league %s (%s)...", league['name'], league['season'])

    league_info = {
      "name": league['name'],
      "key": league['key']
    }

    teams = api.get_league_teams(league['key'])
    teams_dict = {
      team['id']: team
      for team in teams
    }

    for team in teams:
      logger.info("Fetching matchup info for team %s in league %s (%s)...", team['name'], league['name'], league['season'])
      team['matchups'] = api.get_team_matchups(team['key'])
      logger.info("Fetching roster info for team %s in league %s (%s)...", team['name'], league['name'], league['season'])
      team['rosters'] = api.get_team_rosters(team['key'])

    league_info['teams'] = teams

    logger.info("Fetching matchups for league %s (%s)...", league['name'], league['season'])
    league_info['matchups'] = api.get_matchups(league['key'])

    league_infos.append(league_info)

  with open('leagues-raw.json', 'w') as league_file:
    league_file.write(json.dumps(league_infos, indent=1))
