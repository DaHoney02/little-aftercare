from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)


def test_password_hash():
    password = "TestPassword123!"

    hashed = hash_password(password)

    # 哈希结果不能等于原密码
    assert hashed != password

    # 正确密码验证成功
    assert verify_password(password, hashed)

    # 错误密码验证失败
    assert not verify_password("WrongPassword123!", hashed)


def test_jwt_token():
    user_id = 1001

    token = create_access_token(str(user_id))

    decoded_user_id = decode_access_token(token)

    assert decoded_user_id == str(user_id)


def test_invalid_jwt_token():
    try:
        decode_access_token("invalid.token.value")
    except ValueError:
        pass
    else:
        raise AssertionError("无效 Token 应当验证失败")