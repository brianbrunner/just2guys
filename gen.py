#!/usr/bin/env python3

import os
import time

from jinja2 import Environment, FileSystemLoader
from watchdog.observers import Observer

from models import *

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
    with open(output_file_abs, 'w') as f:
        f.write(template.render(**context))

def render_index():
    leagues = League.select()
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
    _render_template('manager.html', 'manager/%s/index.html' % manager.id, { 'manager': manager })

class Renderer():
    def dispatch(self, event):
        print(event)
        self.render()

    def render(self):
        print("Rendering...")
        render_index()
        render_leagues()
        render_managers()

if __name__ == "__main__":
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
