import os
import json

import jinja2

class Builder(object):

  def __init__(self):
    with open('./leagues.json') as league_file:
      self.leagues = json.load(league_file)

  def render(self, template_name, context):
      return jinja2.Environment(
          loader=jinja2.FileSystemLoader('./templates')
      ).get_template(template_name).render(context)

  def render_to_file(self, template_name, output_name, context):
    html = self.render(template_name, context)
    output_name = os.path.abspath(output_name)
    if not os.path.exists(os.path.dirname(output_name)):
      os.makedirs(os.path.dirname(output_name))
    with open(output_name, 'w') as output_file:
      output_file.write(html)

  def build(self):
    self.render_index()
    for league in self.leagues:
      self.render_league(league)

  def render_index(self):
    self.render_to_file('index.html','index.html', {
      'leagues': self.leagues
    })

  def render_league(self, league):
    self.render_to_file('league.html', 'league/%s/index.html' % league['key'], {
      'league': league
    })
    for team in league['teams']:
      self.render_to_file('team.html', 'team/%s/index.html' % team['key'], {
        'team': team
      })

if __name__ == "__main__":
  builder = Builder()
  builder.build()
