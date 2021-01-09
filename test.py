from models import *

l = League.select().where(League.key=='314.l.818997')[0]
print([t.group for t in l.teams])
print(l.is_multi_league)
l.build_playoffs()
