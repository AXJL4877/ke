from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from api.deps import DbDep
from core.security import create_access_token, hash_password, verify_password
from db.models import User

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: DbDep) -> LoginResponse:
    user = db.query(User).filter(User.username == body.username).first()
    if user is None:
        # 壳阶段：首个用户自动注册，便于本地启动
        user = User(username=body.username, hashed_password=hash_password(body.password))
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=str(user.id))
    return LoginResponse(
        access_token=token,
        user={"id": str(user.id), "username": user.username},
    )
