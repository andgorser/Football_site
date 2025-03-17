CREATE TABLE teams (
    team_id SERIAL PRIMARY KEY,
    team_nm VARCHAR(255) NOT NULL,
    create_dt DATE,
    captain_id INT,
    vice_captain_id INT,
    photo_url VARCHAR(255)
);

CREATE TABLE players (
    player_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255) NOT NULL,
    second_name VARCHAR(255),
    date_of_birth DATE NOT NULL,
    age INT NOT NULL,
    msu_status VARCHAR(3) NOT NULL,
    course_num INT,
    faculty VARCHAR(3)
);

CREATE TABLE tournaments (
    tournament_id SERIAL PRIMARY KEY,
    tournament_nm VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE
);

CREATE TABLE divisions (
    division_id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(tournament_id) /* ON DELETE CASCADE */,
    division_nm VARCHAR(255) NOT NULL
);

CREATE TABLE tournament_teams (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(tournament_id) /* ON DELETE CASCADE */,
    division_id INT REFERENCES divisions(division_id) /* ON DELETE SET NULL */,
    team_id INT NOT NULL REFERENCES teams(team_id) /* ON DELETE CASCADE */
);

CREATE TABLE tournament_players (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(tournament_id) /* ON DELETE CASCADE */,
    player_id INT NOT NULL REFERENCES players(player_id) /* ON DELETE CASCADE */,
    team_id INT NOT NULL REFERENCES tournament_teams(id) /* ON DELETE CASCADE */
);

CREATE TABLE matches (
    match_id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(tournament_id) /* ON DELETE CASCADE */,
    division_id INT REFERENCES divisions(division_id) /* ON DELETE SET NULL */,
    team1_id INT NOT NULL REFERENCES tournament_teams(id) /* ON DELETE CASCADE */,
    team2_id INT NOT NULL REFERENCES tournament_teams(id) /* ON DELETE CASCADE */,
    date TIMESTAMP NOT NULL,
    score_team1 INT DEFAULT 0,
    score_team2 INT DEFAULT 0
);

CREATE TABLE match_players (
    id SERIAL PRIMARY KEY,
    match_id INT NOT NULL REFERENCES matches(match_id) /* ON DELETE CASCADE */,
    player_id INT NOT NULL REFERENCES tournament_players(id) /* ON DELETE CASCADE */,
    team_id INT NOT NULL REFERENCES tournament_teams(id) /* ON DELETE CASCADE */,
    position VARCHAR(50),
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    yellow_cards INT DEFAULT 0,
    red_cards INT DEFAULT 0
);

CREATE TABLE goals (
    id SERIAL PRIMARY KEY,
    match_id INT NOT NULL REFERENCES matches(match_id) /* ON DELETE CASCADE */,
    player_id INT NOT NULL REFERENCES tournament_players(id) /* ON DELETE CASCADE */,
    team_id INT NOT NULL REFERENCES tournament_teams(id) /* ON DELETE CASCADE */,
    minute INT NOT NULL CHECK (minute BETWEEN 1 AND 120)
);

CREATE TABLE players_teams (
    id SERIAL PRIMARY KEY,
    player_id INT NOT NULL REFERENCES players(player_id) /* ON DELETE CASCADE */,
    team_id INT NOT NULL REFERENCES teams(team_id) /* ON DELETE CASCADE */,
    valid_from_dttm TIMESTAMP NOT NULL,
    valid_to_dttm TIMESTAMP NULL
);

CREATE TABLE transfers (
    id SERIAL PRIMARY KEY,
    player_id INT NOT NULL REFERENCES players(player_id) /* ON DELETE CASCADE */,
    from_team_id INT REFERENCES teams(team_id) /* ON DELETE SET NULL */,
    to_team_id INT NOT NULL REFERENCES teams(team_id) /* ON DELETE CASCADE */,
    transfer_date DATE NOT NULL,
    transfer_type VARCHAR(50) CHECK (transfer_type IN ('Permanent', 'Loan', 'Free agent'))
);
