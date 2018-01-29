#!/usr/bin/env python3

import os
import json

import jinja2

def league_link(league):
  return 'league/%s/%s' % (league['name'].replace(' ','_'), league['key'])

def team_link(team, league):
  return '%s/team/%s/%s' % (league['name'].replace(' ','_'), team['name'].replace(' ','_'), team['key'])

def player_link(player, league):
  return '%s/player/%s/%s' % (league['name'].replace(' ','_'), player['name'].replace(' ','_'), player['key'])

def matchup_link(matchup, league):
  teams = sorted(matchup['teams'], key=lambda t: t['name'])
  return '%s/week/%s/%s/%s/%s' % (league['name'].replace(' ','_'), matchup['week'], teams[0]['name'].replace(' ','_'), teams[1]['name'].replace(' ','_'), matchup['key'])

class Builder(object):

  def __init__(self):
    with open('./leagues.json') as league_file:
      self.leagues = json.load(league_file)

  @property
  def jinja_env(self):
    if not hasattr(self, '_env'):
      self._env = jinja2.Environment(
        loader=jinja2.FileSystemLoader('./templates')
      )
      self._env.filters['league_link'] = league_link
      self._env.filters['team_link'] = team_link
      self._env.filters['matchup_link'] = matchup_link
      self._env.filters['player_link'] = player_link
    return self._env

  def render(self, template_name, context):
      return self.jinja_env.get_template(template_name).render(context)

  def render_to_file(self, template_name, output_name, context):
    html = self.render(template_name, context)
    output_name = os.path.abspath(output_name)
    if not os.path.exists(os.path.dirname(output_name)):
      os.makedirs(os.path.dirname(output_name))
    with open(output_name, 'wb') as output_file:
      output_file.write(html.encode('utf-8'))

  def build(self):
    self.render_index()
    for league in self.leagues:
      self.render_league(league)

  def render_index(self):
    self.render_to_file('index.html','index.html', {
      'leagues': self.leagues
    })

  def render_league(self, league):
    self.render_to_file('league.html', '%s/index.html' % league_link(league), {
      'league': league
    })
    for team in league['teams']:
      self.render_to_file('team.html', '%s/index.html' % team_link(team, league), {
        'league': league,
        'team': team
      })
    for index, week_matchups in enumerate(league['matchups']):
      for matchup in week_matchups:
        self.render_to_file('matchup.html', '%s/index.html' % matchup_link(matchup, league), {
          'league': league,
          'matchup': matchup,
          'rosters': [
            self.team_for_key(league, matchup['teams'][0]['key'])['rosters'][index],
            self.team_for_key(league, matchup['teams'][1]['key'])['rosters'][index],
          ]
        })

  def team_for_key(self, league, team_key):
    return list(filter(lambda t: t['key'] == team_key, league['teams']))[0]

if __name__ == "__main__":
  builder = Builder()
  builder.build()
