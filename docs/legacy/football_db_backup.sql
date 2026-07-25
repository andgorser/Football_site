--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: divisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.divisions (
    division_id integer NOT NULL,
    tournament_id integer NOT NULL,
    division_nm character varying(255) NOT NULL
);


ALTER TABLE public.divisions OWNER TO postgres;

--
-- Name: divisions_division_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.divisions_division_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.divisions_division_id_seq OWNER TO postgres;

--
-- Name: divisions_division_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.divisions_division_id_seq OWNED BY public.divisions.division_id;


--
-- Name: goals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.goals (
    id integer NOT NULL,
    match_id integer NOT NULL,
    player_id integer NOT NULL,
    team_id integer NOT NULL,
    minute integer NOT NULL,
    CONSTRAINT goals_minute_check CHECK (((minute >= 1) AND (minute <= 120)))
);


ALTER TABLE public.goals OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.goals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.goals_id_seq OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.goals_id_seq OWNED BY public.goals.id;


--
-- Name: match_players; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.match_players (
    id integer NOT NULL,
    match_id integer NOT NULL,
    player_id integer NOT NULL,
    team_id integer NOT NULL,
    "position" character varying(50),
    goals integer DEFAULT 0,
    assists integer DEFAULT 0,
    yellow_cards integer DEFAULT 0,
    red_cards integer DEFAULT 0
);


ALTER TABLE public.match_players OWNER TO postgres;

--
-- Name: match_players_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.match_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.match_players_id_seq OWNER TO postgres;

--
-- Name: match_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.match_players_id_seq OWNED BY public.match_players.id;


--
-- Name: matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matches (
    match_id integer NOT NULL,
    tournament_id integer NOT NULL,
    division_id integer,
    team1_id integer NOT NULL,
    team2_id integer NOT NULL,
    match_dttm timestamp without time zone NOT NULL,
    score_team1 integer DEFAULT 0,
    score_team2 integer DEFAULT 0
);


ALTER TABLE public.matches OWNER TO postgres;

--
-- Name: matches_match_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.matches_match_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matches_match_id_seq OWNER TO postgres;

--
-- Name: matches_match_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.matches_match_id_seq OWNED BY public.matches.match_id;


--
-- Name: players; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.players (
    player_id integer NOT NULL,
    name character varying(255) NOT NULL,
    surname character varying(255) NOT NULL,
    second_name character varying(255),
    date_of_birth date NOT NULL,
    age integer NOT NULL,
    msu_status character varying(3) NOT NULL,
    course_num integer,
    faculty character varying(3)
);


ALTER TABLE public.players OWNER TO postgres;

--
-- Name: players_player_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.players_player_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.players_player_id_seq OWNER TO postgres;

--
-- Name: players_player_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.players_player_id_seq OWNED BY public.players.player_id;


--
-- Name: players_teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.players_teams (
    id integer NOT NULL,
    player_id integer NOT NULL,
    team_id integer NOT NULL,
    valid_from_dttm timestamp without time zone NOT NULL,
    valid_to_dttm timestamp without time zone
);


ALTER TABLE public.players_teams OWNER TO postgres;

--
-- Name: players_teams_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.players_teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.players_teams_id_seq OWNER TO postgres;

--
-- Name: players_teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.players_teams_id_seq OWNED BY public.players_teams.id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    team_id integer NOT NULL,
    team_nm character varying(255) NOT NULL,
    create_dt date,
    captain_id integer,
    vice_captain_id integer,
    photo_url character varying(255)
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: teams_team_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teams_team_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teams_team_id_seq OWNER TO postgres;

--
-- Name: teams_team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teams_team_id_seq OWNED BY public.teams.team_id;


--
-- Name: tournament_players; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tournament_players (
    id integer NOT NULL,
    tournament_id integer NOT NULL,
    player_id integer NOT NULL,
    team_id integer NOT NULL
);


ALTER TABLE public.tournament_players OWNER TO postgres;

--
-- Name: tournament_players_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tournament_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tournament_players_id_seq OWNER TO postgres;

--
-- Name: tournament_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tournament_players_id_seq OWNED BY public.tournament_players.id;


--
-- Name: tournament_teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tournament_teams (
    id integer NOT NULL,
    tournament_id integer NOT NULL,
    division_id integer,
    team_id integer NOT NULL
);


ALTER TABLE public.tournament_teams OWNER TO postgres;

--
-- Name: tournament_teams_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tournament_teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tournament_teams_id_seq OWNER TO postgres;

--
-- Name: tournament_teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tournament_teams_id_seq OWNED BY public.tournament_teams.id;


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tournaments (
    tournament_id integer NOT NULL,
    tournament_nm character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date
);


ALTER TABLE public.tournaments OWNER TO postgres;

--
-- Name: tournaments_tournament_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tournaments_tournament_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tournaments_tournament_id_seq OWNER TO postgres;

--
-- Name: tournaments_tournament_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tournaments_tournament_id_seq OWNED BY public.tournaments.tournament_id;


--
-- Name: transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transfers (
    id integer NOT NULL,
    player_id integer NOT NULL,
    from_team_id integer,
    to_team_id integer NOT NULL,
    transfer_date date NOT NULL,
    transfer_type character varying(50),
    CONSTRAINT transfers_transfer_type_check CHECK (((transfer_type)::text = ANY ((ARRAY['Permanent'::character varying, 'Loan'::character varying, 'Free agent'::character varying])::text[])))
);


ALTER TABLE public.transfers OWNER TO postgres;

--
-- Name: transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transfers_id_seq OWNER TO postgres;

--
-- Name: transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transfers_id_seq OWNED BY public.transfers.id;


--
-- Name: divisions division_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.divisions ALTER COLUMN division_id SET DEFAULT nextval('public.divisions_division_id_seq'::regclass);


--
-- Name: goals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals ALTER COLUMN id SET DEFAULT nextval('public.goals_id_seq'::regclass);


--
-- Name: match_players id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.match_players ALTER COLUMN id SET DEFAULT nextval('public.match_players_id_seq'::regclass);


--
-- Name: matches match_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches ALTER COLUMN match_id SET DEFAULT nextval('public.matches_match_id_seq'::regclass);


--
-- Name: players player_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players ALTER COLUMN player_id SET DEFAULT nextval('public.players_player_id_seq'::regclass);


--
-- Name: players_teams id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players_teams ALTER COLUMN id SET DEFAULT nextval('public.players_teams_id_seq'::regclass);


--
-- Name: teams team_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams ALTER COLUMN team_id SET DEFAULT nextval('public.teams_team_id_seq'::regclass);


--
-- Name: tournament_players id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_players ALTER COLUMN id SET DEFAULT nextval('public.tournament_players_id_seq'::regclass);


--
-- Name: tournament_teams id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_teams ALTER COLUMN id SET DEFAULT nextval('public.tournament_teams_id_seq'::regclass);


--
-- Name: tournaments tournament_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournaments ALTER COLUMN tournament_id SET DEFAULT nextval('public.tournaments_tournament_id_seq'::regclass);


--
-- Name: transfers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfers ALTER COLUMN id SET DEFAULT nextval('public.transfers_id_seq'::regclass);


--
-- Data for Name: divisions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.divisions (division_id, tournament_id, division_nm) FROM stdin;
\.


--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.goals (id, match_id, player_id, team_id, minute) FROM stdin;
\.


--
-- Data for Name: match_players; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.match_players (id, match_id, player_id, team_id, "position", goals, assists, yellow_cards, red_cards) FROM stdin;
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matches (match_id, tournament_id, division_id, team1_id, team2_id, match_dttm, score_team1, score_team2) FROM stdin;
1	1	\N	1	2	2025-03-23 14:00:00	2	1
2	1	\N	1	2	2025-03-23 14:00:00	2	1
3	1	\N	1	2	2025-03-23 21:00:00	10	0
4	1	\N	2	1	2025-03-12 22:30:00	1	0
\.


--
-- Data for Name: players; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.players (player_id, name, surname, second_name, date_of_birth, age, msu_status, course_num, faculty) FROM stdin;
\.


--
-- Data for Name: players_teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.players_teams (id, player_id, team_id, valid_from_dttm, valid_to_dttm) FROM stdin;
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teams (team_id, team_nm, create_dt, captain_id, vice_captain_id, photo_url) FROM stdin;
1	Team A	2025-03-23	\N	\N	\N
2	Team B	2025-03-23	\N	\N	\N
\.


--
-- Data for Name: tournament_players; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tournament_players (id, tournament_id, player_id, team_id) FROM stdin;
\.


--
-- Data for Name: tournament_teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tournament_teams (id, tournament_id, division_id, team_id) FROM stdin;
1	1	\N	1
2	1	\N	2
\.


--
-- Data for Name: tournaments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tournaments (tournament_id, tournament_nm, start_date, end_date) FROM stdin;
1	Test Tournament	2025-03-23	\N
\.


--
-- Data for Name: transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transfers (id, player_id, from_team_id, to_team_id, transfer_date, transfer_type) FROM stdin;
\.


--
-- Name: divisions_division_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.divisions_division_id_seq', 1, false);


--
-- Name: goals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.goals_id_seq', 1, false);


--
-- Name: match_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.match_players_id_seq', 1, false);


--
-- Name: matches_match_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matches_match_id_seq', 4, true);


--
-- Name: players_player_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.players_player_id_seq', 1, false);


--
-- Name: players_teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.players_teams_id_seq', 1, false);


--
-- Name: teams_team_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.teams_team_id_seq', 2, true);


--
-- Name: tournament_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tournament_players_id_seq', 1, false);


--
-- Name: tournament_teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tournament_teams_id_seq', 2, true);


--
-- Name: tournaments_tournament_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tournaments_tournament_id_seq', 1, true);


--
-- Name: transfers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transfers_id_seq', 1, false);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (division_id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: match_players match_players_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (match_id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (player_id);


--
-- Name: players_teams players_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players_teams
    ADD CONSTRAINT players_teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (team_id);


--
-- Name: tournament_players tournament_players_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_pkey PRIMARY KEY (id);


--
-- Name: tournament_teams tournament_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_pkey PRIMARY KEY (id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (tournament_id);


--
-- Name: transfers transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(tournament_id);


--
-- Name: goals goals_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id);


--
-- Name: goals goals_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.tournament_players(id);


--
-- Name: goals goals_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id);


--
-- Name: match_players match_players_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id);


--
-- Name: match_players match_players_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.tournament_players(id);


--
-- Name: match_players match_players_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id);


--
-- Name: matches matches_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id);


--
-- Name: matches matches_team1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team1_id_fkey FOREIGN KEY (team1_id) REFERENCES public.tournament_teams(id);


--
-- Name: matches matches_team2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team2_id_fkey FOREIGN KEY (team2_id) REFERENCES public.tournament_teams(id);


--
-- Name: matches matches_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(tournament_id);


--
-- Name: players_teams players_teams_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players_teams
    ADD CONSTRAINT players_teams_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id);


--
-- Name: players_teams players_teams_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players_teams
    ADD CONSTRAINT players_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id);


--
-- Name: tournament_players tournament_players_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id);


--
-- Name: tournament_players tournament_players_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id);


--
-- Name: tournament_players tournament_players_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_players
    ADD CONSTRAINT tournament_players_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(tournament_id);


--
-- Name: tournament_teams tournament_teams_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id);


--
-- Name: tournament_teams tournament_teams_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id);


--
-- Name: tournament_teams tournament_teams_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(tournament_id);


--
-- Name: transfers transfers_from_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_from_team_id_fkey FOREIGN KEY (from_team_id) REFERENCES public.teams(team_id);


--
-- Name: transfers transfers_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(player_id);


--
-- Name: transfers transfers_to_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_to_team_id_fkey FOREIGN KEY (to_team_id) REFERENCES public.teams(team_id);


--
-- Name: TABLE divisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.divisions TO site_admin;


--
-- Name: SEQUENCE divisions_division_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.divisions_division_id_seq TO site_admin;


--
-- Name: TABLE goals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.goals TO site_admin;


--
-- Name: SEQUENCE goals_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.goals_id_seq TO site_admin;


--
-- Name: TABLE match_players; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.match_players TO site_admin;


--
-- Name: SEQUENCE match_players_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.match_players_id_seq TO site_admin;


--
-- Name: TABLE matches; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.matches TO site_admin;


--
-- Name: SEQUENCE matches_match_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.matches_match_id_seq TO site_admin;


--
-- Name: TABLE players; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.players TO site_admin;


--
-- Name: SEQUENCE players_player_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.players_player_id_seq TO site_admin;


--
-- Name: TABLE players_teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.players_teams TO site_admin;


--
-- Name: SEQUENCE players_teams_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.players_teams_id_seq TO site_admin;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teams TO site_admin;


--
-- Name: SEQUENCE teams_team_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.teams_team_id_seq TO site_admin;


--
-- Name: TABLE tournament_players; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tournament_players TO site_admin;


--
-- Name: SEQUENCE tournament_players_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tournament_players_id_seq TO site_admin;


--
-- Name: TABLE tournament_teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tournament_teams TO site_admin;


--
-- Name: SEQUENCE tournament_teams_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tournament_teams_id_seq TO site_admin;


--
-- Name: TABLE tournaments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tournaments TO site_admin;


--
-- Name: SEQUENCE tournaments_tournament_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tournaments_tournament_id_seq TO site_admin;


--
-- Name: TABLE transfers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.transfers TO site_admin;


--
-- Name: SEQUENCE transfers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.transfers_id_seq TO site_admin;


--
-- PostgreSQL database dump complete
--

