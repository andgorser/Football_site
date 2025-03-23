from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Замени user и password на свои реальные данные
DATABASE_URL = "postgresql://postgres:password@localhost/football_db"  # поменял на зашлушку пароль, т.к. изначально вписывал свой пароль
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Tournament(Base):
    __tablename__ = "tournaments"
    tournament_id = Column(Integer, primary_key=True, index=True)
    tournament_nm = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

class TournamentCreate(BaseModel):
    tournament_nm: str
    start_date: str  # Ожидаем строку в формате YYYY-MM-DD
    end_date: str | None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/create_tournament/")
def create_tournament(tournament: TournamentCreate, db: Session = Depends(get_db)):
    db_tournament = Tournament(
        tournament_nm=tournament.tournament_nm,
        start_date=tournament.start_date,  # SQLAlchemy автоматически преобразует строку в Date
        end_date=tournament.end_date
    )
    db.add(db_tournament)
    db.commit()
    db.refresh(db_tournament)
    return {"message": "Tournament created successfully", "id": db_tournament.tournament_id}

# Создаем таблицы в базе данных при запуске
# Base.metadata.create_all(bind=engine)