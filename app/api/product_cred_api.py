
from fastapi import APIRouter, status, UploadFile, File, Form, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pathlib import  Path

from starlette.responses import FileResponse

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.db.product_cred_repos import ProductCredRepository
from app.schemas.product_cred_schema import ProductCredResponse
from app.services.file_storage import file_storage, FileStorageError

router=APIRouter(
    prefix="/product-cred",
    tags=["商品凭证"]
)

@router.post(
    "",
    response_model=ProductCredResponse,
    status_code=status.HTTP_201_CREATED
)

async def upload_product_cred(
        file:UploadFile=File(...),
        product_id:int|None=Form(default=None),
        db:Session=Depends(get_db),
        current_user=Depends(get_current_user)
):
    # 若指定商品，必须确定商品属于当前登录用户
    if product_id is not None:
        exists=ProductCredRepository.owned_product_exists(
            db,
            product_id,
            current_user.id
        )
        if not exists:
            raise  HTTPException(
                status_code=404,
                detail="商品不存在"
            )

    # 文件操作
    try:
        file_info=await file_storage.save(file)
    except FileStorageError as exc:
        raise  HTTPException(
            status_code=400,
            detail=str(exc)
        )from exc
    finally:
        await file.close()

    try:
        credential=ProductCredRepository.create(
            db=db,
            user_id=current_user.id,
            product_id=product_id,
            **file_info
        )
    except Exception:
        file_storage.delete(file_info["storage_path"])
        raise

    return credential
@router.get(
    "",
    response_model=list[ProductCredResponse]
)
def list_product_cred(
        product_id:int | None=None,
        db:Session=Depends(get_db),
        current_user=Depends(get_current_user)
):
    """查询当前用户的购物凭证"""

    if product_id is not None:
        exists=ProductCredRepository.owned_product_exists(
            db,
            product_id,
            current_user.id
        )

        if not exists:
            raise HTTPException(
                status_code=404,
                detail="商品不存在"
            )
    return ProductCredRepository.list_by_user(
        db,
        current_user.id,
        product_id
    )

@router.delete(
    "/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_product_cred(
        credential_id:int,
        db:Session=Depends(get_db),
        current_user=Depends(get_current_user)
):
    """删除当前用的购物凭证及文件"""

    credential=ProductCredRepository.get_by_id(
        db,
        credential_id,
        current_user.id
    )
    if credential is None:
        raise HTTPException(
            status_code=404,
            detail="凭证不存在"
        )

    storage_path=credential.storage_path

    #先提交数据库删除，再删除物理文件
    #避免文件先删除、数据库提交失败时留下无文件的记录
    ProductCredRepository.delete(db,credential)

    try:
        file_storage.delete(storage_path)
    except FileStorageError:
        raise  HTTPException(
            status_code=500,
            detail="凭证记录已删除，但文件清理失败，请联系管理员"
        )

@router.get("/{credential_id}/file")
def get_product_cred_file(
        credential_id:int,
        disposition:str=Query(
            default="inline",
            pattern="^(inline|attachment)$",
            description="inline 表示预览，attachment表示下载"
        ),
        db:Session=Depends(get_db),
        current_user=Depends(get_current_user)
):
    """预览或下载当前登录用户的购物凭证"""

    credential=ProductCredRepository.get_by_id(
        db,
        credential_id,
        current_user.id
    )
    if credential is None:
        raise  HTTPException(
            status_code=404,
            detail="凭证不存在"
        )
    # 获取数据库中保存的文件路径
    file_path=Path(credential.storage_path).resolve()

    # 再次检查路径，防止异常路径访问上传目录外的文件
    if file_path.parent !=file_storage.base_dir:
        raise  HTTPException(
            status_code=404,
            detail="文件不存在"
        )
    # 检查文件是否真实存在
    if not file_path.is_file():
        raise  HTTPException(
            status_code=404,
            detail="凭证文件不存在"
        )

    if disposition=="inline":
        if credential.content_type not in {
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
        }:
            raise  HTTPException(
                status_code=400,
                detail="该文件格式不支持在线预览，请下载后查看"
            )

    # 设置浏览器处理方式
    return FileResponse(
        path=file_path,
        media_type=credential.content_type,
        filename=credential.file_name,
        content_disposition_type=disposition,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )

