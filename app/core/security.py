
"""
密码与JWT工具
"""
from datetime import timedelta, timezone, datetime

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

# 创建密码哈希工具，使用Argon2算法
password_hash=PasswordHash.recommended()

def hash_password(password:str)->str:
    """
    对用户密码进行哈希处理

    注册时调用：
    明文-》Argon2哈希-》存入数据库
    """
    return password_hash.hash(password)


def verify_password(
        plain_password:str,
        hashed_password:str
)->bool:
    """
    验证用户输入密码是否与数据库中的哈希匹配
    登录时调用，不需要解密与按密码
    """
    return password_hash.verify(plain_password,hashed_password)


def create_access_token(
        subject:str,
        expires_delta:timedelta | None=None
)->str:
    """
    创建(签发) JWT Access Token
    :param subject: 用户ID
    :param expires_delta: 可选的自定义有效期
    """
    now=datetime.now(timezone.utc)  #当前utc时间

    # 可选的自动以有效期，不传就用默认值
    expire=now+(expires_delta or timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    ))

    # 构造JWT的payload载荷，即声明集合（注册声明）
    payload={
        "sub":str(subject),  #主体，用户id  ---自己校验
        "iat":now,  #签发时间
        "exp":expire  #过期时间---由decode自动校验
    }
    #token=密钥+算法（配置中取）
    token=jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM  #白名单
    )

    return token

def decode_access_token(token:str)->str:
    """
    验证JWT并提取用户ID
    :return: 用户ID（字符串）
    """
    try:
        payload=jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )

        subject=payload.get("sub")

        if not isinstance(subject,str) or not subject:
            raise ValueError("Token中缺少有效用户标识")

        return subject

    except jwt.InvalidTokenError as exc:
        raise ValueError("Token 无效或已过期") from exc
