from sqlalchemy.orm import Session

from app.db.models import ProductCred, Product


class ProductCredRepository:
    """购物凭证数据库操作层：只负责读写"""
    @staticmethod
    def create(
            db:Session,
            *,
            user_id:int,
            product_id:int | None,
            file_name:str,
            storage_name:str,
            storage_path:str,
            content_type:str,
            file_size:int
    )->ProductCred:
        credential=ProductCred(
            user_id=user_id,
            product_id=product_id,
            file_name=file_name,
            storage_name=storage_name,
            storage_path=storage_path,
            content_type=content_type,
            file_size=file_size,
        )
        db.add(credential)

        try:
            db.commit()
            db.refresh(credential)
        except Exception:
            db.rollback()
            raise
        return credential

    @staticmethod
    def get_by_id(
            db:Session,
            credential_id:int,
            user_id:int
    )->ProductCred | None:
        return (
            db.query(ProductCred)
            .filter(
                ProductCred.id==credential_id,
                ProductCred.user_id==user_id
            )
            .first()
        )

    @staticmethod
    def list_by_user(
            db:Session,
            user_id:int,
            product_id:int | None=None
    )->list[ProductCred]:
        query=db.query(ProductCred).filter(
            ProductCred.user_id==user_id
        )
        if product_id is not None:
            query=query.filter(
                ProductCred.product_id==product_id
            )
        return query.order_by(
            ProductCred.created_at.desc()
        ).all()

    @staticmethod
    def update_product(
            db: Session,
            credential: ProductCred,
            product_id: int | None,
    ) -> ProductCred:
        """修改凭证关联的商品。

        product_id:
        - 正整数：关联指定商品
        - None：解除商品关联
        """
        credential.product_id = product_id
        db.flush()

        return credential

    @staticmethod
    def delete(
            db:Session,
            credential:ProductCred
    )->None:
        try:
            db.delete(credential)
            db.commit()
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def owned_product_exists(
            db:Session,
            product_id:int,
            user_id:int
    )->bool:
        return (
            db.query(Product.id)
            .filter(
                Product.id==product_id,
                Product.user_id==user_id
            )
            .first()
            is not None
        )
