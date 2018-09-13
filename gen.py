#!/usr/bin/env python3

import os
import time
import traceback
from collections import defaultdict

from jinja2 import Environment, FileSystemLoader
from watchdog.events import FileModifiedEvent
from watchdog.observers import Observer

from models import *
from records import *

PLAYER_RECORDS = defaultdict(list)
MANAGER_RECORDS = defaultdict(list)
RECORDS = [
    ManagerMostWins(),
    ManagerBestRecord(),
    ManagerFavoritePlayer(),
    RealDedication(),
    PostseasonAppearances(),
    Demolished()
]

def load_records():
    print("Loading records...")
    for record in RECORDS:
        # Noop, just gets it cached
        entries = record.processed_entries
        name = record.name.replace(' ','_').lower()
        link = '/records/%s' % name
        for row in entries:
            for column in row:
                if isinstance(column, Player):
                    PLAYER_RECORDS[column.id].append({
                        'meta': record,
                        'link': link,
                        'entry': row
                    })
                elif isinstance(column, Manager):
                    MANAGER_RECORDS[column.id].append({
                        'meta': record,
                        'link': link,
                        'entry': row
                    })
    print("Records loaded...")

def _load_template(name):
    template_file = os.path.join(os.path.abspath('./templates'), name)
    with open(template_file) as f:
        return Environment(loader=FileSystemLoader('./templates')).from_string(f.read())

def _render_template(template_name, output_file, context):
    output_file_abs = os.path.abspath(output_file)
    output_dir = os.path.dirname(output_file_abs)
    try:
        os.makedirs(output_dir)
    except FileExistsError:
        pass
    template = _load_template(template_name)
    with open(output_file_abs, 'wb') as f:
        f.write(template.render(**context).encode('utf-16'))

def render_index():
    leagues = League.select().order_by(League.season)
    _render_template('leagues.html', 'index.html', { 'leagues': leagues })

def render_leagues():
    leagues = League.select()
    for league in leagues:
        _render_template('league.html', 'league/%s/index.html' % league.id, { 'league': league })
        for team in league.teams.select():
            render_team(league, team)

def render_team(league, team):
    _render_template('team.html', 'league/%s/team/%s/index.html' % (league.id, team.id),
                     { 'team': team })

def render_managers():
    managers = Manager.select()
    _render_template('managers.html', 'managers/index.html', { 'managers': managers })
    for manager in managers:
        render_manager(manager)

def render_manager(manager):
    records = MANAGER_RECORDS[manager.id]
    _render_template('manager.html', 'manager/%s/index.html' % manager.id, {
        'manager': manager,
        'records': records
    })

def render_records():
    records_list = []
    for record in RECORDS:
        name = record.name.replace(' ','_').lower()
        _render_template('record.html', 'records/%s/index.html' % name, { 'record': record })
        records_list.append({
            'name': record.name,
            'link': '/records/%s' % name,
            'description': record.description
        })
    records = sorted(records_list, key=lambda r: r['name'])
    _render_template('records.html', 'records/index.html', { 'records': records })

def render_matchups():
    for matchup in Matchup.select():
        _render_template('matchup.html', 'league/%s/matchup/%s/index.html' % (
            matchup.league.id,
            matchup.id
        ), {
            'matchup': matchup
        })

def render_players():
    for player in Player.select():
        records = PLAYER_RECORDS[player.id]
        _render_template('player.html', 'player/%s/index.html' % player.id, {
            'player': player,
            'records': records
        })

class Renderer():
    def dispatch(self, event):
        if isinstance(event, FileModifiedEvent):
            try:
                self.render()
            except Exception as e:
                traceback.print_exc()

    def render(self):
        print("Rendering...")
        render_index()
        render_leagues()
        render_managers()
        render_players()
        render_records()
        render_matchups()
        print("Rendering complete...")

if __name__ == "__main__":
    load_records()
    path = './templates'
    observer = Observer()
    renderer = Renderer()
    renderer.render()
    observer.schedule(renderer, path, recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()
