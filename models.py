from peewee import *

db = SqliteDatabase('football.db')


class FootballModel(Model):

    class Meta:
        database = db


class Token(FootballModel):
    token = CharField()

class League(FootballModel):
    _id = CharField(unique=True)
    key = CharField(unique=True)
    name = CharField()
    season = IntegerField()
    current_week = IntegerField()
    is_finished = BooleanField()


class Player(FootballModel):
    _id = CharField(unique=True)
    key = CharField(unique=True)
    name = CharField()
    display_position = CharField()
    position_type = CharField()
    image_url = CharField()


class Manager(FootballModel):
    _id = CharField(unique=True)
    nickname = CharField()


class Team(FootballModel):
    _id = CharField(unique=True)
    key = CharField(unique=True)
    name = CharField()
    logo = CharField()
    managers = ManyToManyField(Manager, backref='teams')
    roster = ManyToManyField(Player, backref='teams')
    league = ForeignKeyField(League)


class Matchup(FootballModel):
    key = CharField(unique=True)
    league = ForeignKeyField(League)
    week = IntegerField()
    is_playoffs = BooleanField()
    is_consolation = BooleanField()
    winner_team_key = CharField()
    team_a = ForeignKeyField(Team)
    team_a_projected_points = FloatField()
    team_a_points = FloatField()
    team_b = ForeignKeyField(Team)
    team_b_projected_points = FloatField()
    team_b_points = FloatField()


class MatchupRosterSlot(FootballModel):
    week = IntegerField()
    matchup = ForeignKeyField(Matchup)
    team = ForeignKeyField(Team)
    player = ForeignKeyField(Player)
    points = FloatField()
    position = CharField()


db.connect()
db.create_tables([League, Player, Manager, Team, Matchup, MatchupRosterSlot, Token,
                  Team.managers.get_through_model(), Team.roster.get_through_model()])
