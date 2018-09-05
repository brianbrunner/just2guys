#!/usr/bin/env python3

import os

from jinja2 import Environment, FileSystemLoader

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

if __name__ == "__main__":
    render_index()
    render_leagues()
