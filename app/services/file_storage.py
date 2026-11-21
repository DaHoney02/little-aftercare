import uuid
from pathlib import Path

from starlette.datastructures import UploadFile

from app.core.config import settings

#凭证格式约束
ALLOWED_TYPES={
    ".jpg":("image/jpeg",),
    ".jpeg": ("image/jpeg",),
    ".png": ("image/png",),
    ".webp": ("image/webp",),
    ".pdf": ("application/pdf",),
}
MAX_FILE_SIZE=10*1024*1024  #10MB

class FileStorageError(Exception):
    """文件存储或文件校验异常"""

class LocalFileStorage:
    """
    本地文件存储
    业务层只依赖文件存储接口行为
    """
    def __init__(self):
        self.base_dir=Path(settings.UPLOAD_DIR).resolve()
        self.base_dir.mkdir(parents=True,exist_ok=True)

    @staticmethod
    def validate_file(
            filename:str | None,
            content_type:str| None,
            content:bytes
    )->str:
        """检查扩展名、MIME类型和文件实际内容"""

        if not filename:
            raise FileStorageError("文件名不能为空")
        suffix=Path(filename).suffix.lower()

        if suffix not in ALLOWED_TYPES:
            raise FileStorageError("不支持的文件格式")

        if content_type not in ALLOWED_TYPES[suffix]:
            raise  FileStorageError("文件MIME类型不正确")

        if not content:
            raise  FileStorageError("不能上传空文件")

        if len(content) > MAX_FILE_SIZE:
            raise FileStorageError("文件不能超过10MB")

        # 检查文件实际内容
        if suffix in (".jpg",".jpeg"):
            valid=content.startswith(b"\xff\xd8\xff")
        elif suffix==".png":
            valid = content.startswith(b"\x89PNG\r\n\x1a\n")
        elif suffix==".webp":
            valid=(
                len(content)>=12
                and content[:4]==b"RIFF"
                and content[8:12]==b"WEBP"
            )
        else:
            valid=content.startswith(b"%PDF-")

        if not valid:
            raise FileStorageError("文件内容与声明格式不一致")
        return suffix

    async def save(self,upload:UploadFile)->dict:
        """读取上传文件、校验与保存，返回文件元数据"""
        #最多读1字节，以识别超过上限的文件
        content=await  upload.read(MAX_FILE_SIZE+1)
        suffix=self.validate_file(
            upload.filename,
            upload.content_type,
            content
        )

        storage_name=f"{uuid.uuid4().hex}{suffix}"
        target_path=self.base_dir/storage_name

        with target_path.open("xb") as file:
            file.write(content)
        return {
            "file_name": Path(upload.filename).name,
            "storage_name": storage_name,
            "storage_path": str(target_path),
            "content_type": upload.content_type,
            "file_size": len(content),
        }

    def delete(self, storage_path: str) -> None:
        """删除文件；文件不存在时不报错。"""

        path = Path(storage_path).resolve()

        # 防止数据库中的异常路径导致删除上传目录以外的文件
        if path.parent != self.base_dir:
            raise FileStorageError("非法文件路径")

        path.unlink(missing_ok=True)

file_storage = LocalFileStorage()
