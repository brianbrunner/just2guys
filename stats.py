import json

class Stats(object):

  def __init__(self, league_file):
    with open(league_file) as f:
      self.leagues = json.load(f)

  def calculate(self):
    for league in self.leagues:
      self.top_level_stats(league)

  def top_level_stats(self, league):
    league['num_teams'] = len(league['teams'])
    self.calculate_season_record(league)
    self.run_playoffs(league)

  def calculate_season_record(self, league, season_weeks=13):
    teams_dict = {}
    for team in league['teams']:
      team['record'] = {
        'wins': 0,
        'losses': 0,
        'team_points': 0,
        'projected_points': 0
      }
      teams_dict[team['key']] = team
    matchups = league['matchups']
    for i in range(0, season_weeks):
      week_matchups = matchups[i]
      for matchup in week_matchups:
        team_a = teams_dict[matchup['teams'][0]['key']]
        team_b = teams_dict[matchup['teams'][1]['key']]
        team_a['record']['team_points'] += matchup['teams'][0]['team_points']
        team_a['record']['projected_points'] += matchup['teams'][0]['projected_points']
        team_b['record']['team_points'] += matchup['teams'][1]['team_points']
        team_b['record']['projected_points'] += matchup['teams'][1]['projected_points']
        if matchup['winner_team_key'] == team_a['key']:
          team_a['record']['wins'] += 1
          team_b['record']['losses'] += 1
        elif matchup['winner_team_key'] == team_b['key']:
          team_b['record']['wins'] += 1
          team_a['record']['losses'] += 1
        else:
          raise Exception("TOO LAZY FOR TIES")
    league['teams'].sort(key=lambda t: (-(float(t['record']['wins']+1)/float(t['record']['losses']+1)), -t['record']['team_points']))
    print([
      [team['name'], team['record']] for team in league['teams']
    ])

  def run_playoffs(self, league, num_playoff_spots=8):
    playoff_teams = league['teams'][:num_playoff_spots]
    last_place_teams = league['teams'][num_playoff_spots:]
    self.calculate_bracket_wins(playoff_teams)
    self.calculate_bracket_losses(last_place_teams)
    
  def calculate_bracket_wins(self, teams):
    pass

  def calculate_bracket_losses(self, teams):
    pass

  def write(self, outfile='./leagues.json'):
    with open(outfile, 'w') as f:
      json.dump(self.leagues, f)

if __name__ == "__main__":
  stats = Stats("./leagues-raw.json")
  stats.calculate()
  stats.write()
