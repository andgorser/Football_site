from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.openapi.models import HTTPBearer as HTTPBearerModel
from fastapi.middleware.cors import CORSMiddleware  # Добавляем CORS
from pydantic import BaseModel, Field
from databases import Database
from sqlalchemy import create_engine, MetaData
import jwt
from passlib.context import CryptContext
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

app = FastAPI(
    openapi_extra={
        "security": [{"BearerAuth": []}],
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT"
                }
            }
        }
    }
)

# Настраиваем CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Разрешаем фронтенд
    allow_credentials=True,
    allow_methods=["*"],  # Разрешаем все методы (GET, POST и т.д.)
    allow_headers=["*"],  # Разрешаем все заголовки
)

SECRET_KEY = os.getenv("SECRET_KEY", "your_default_secret_key")
ALGORITHM = "HS256"
DATABASE_URL = os.getenv("DATABASE_URL")
HASHED_PASSWORD = os.getenv("HASHED_PASSWORD")
if not DATABASE_URL or not HASHED_PASSWORD:
    raise ValueError("DATABASE_URL или HASHED_PASSWORD не указаны в переменных окружения")

database = Database(DATABASE_URL)
engine = create_engine(DATABASE_URL)
metadata = MetaData()
metadata.reflect(bind=engine)
matches = metadata.tables["matches"]

class MatchInput(BaseModel):
    tournament_id: int
    division_id: int | None = None
    team1_id: int
    team2_id: int
    match_dttm: datetime
    score_team1: int = Field(default=0, ge=0)
    score_team2: int = Field(default=0, ge=0)

class MatchOutput(BaseModel):
    match_id: int
    tournament_id: int
    division_id: int | None
    team1_id: int
    team2_id: int
    match_dttm: datetime
    score_team1: int
    score_team2: int

    class Config:
        from_attributes = True

class LoginData(BaseModel):
    username: str
    password: str

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") not in ["Organizer", "Referee"]:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
        return payload
    except:
        raise HTTPException(status_code=401, detail="Недействительный токен")

@app.on_event("startup")
async def startup():
    await database.connect()

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

@app.get("/matches", response_model=list[MatchOutput])
async def get_matches():
    query = matches.select()
    return await database.fetch_all(query)

@app.post("/matches", response_model=MatchOutput)
async def add_match(match: MatchInput, user: dict = Depends(get_current_user)):
    query = matches.insert().values(**match.dict(exclude_unset=True))
    last_id = await database.execute(query)
    return {**match.dict(), "match_id": last_id}

@app.post("/login")
async def login(data: LoginData):
    if data.username == "admin" and pwd_context.verify(data.password, HASHED_PASSWORD):
        token = jwt.encode({"role": "Organizer"}, SECRET_KEY, algorithm=ALGORITHM)
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Неверные данные")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)