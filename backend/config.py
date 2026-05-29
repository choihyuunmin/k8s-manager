from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DB_PATH: str = "./data/k8s-manager.db"
    SECRET_KEY: str = "k8s-manager-secret-key-change-in-production"
    ADMIN_PASSWORD: str = "admin123"
    UPLOAD_DIR: str = "./data/uploads"
    KUBECONFIG_PATH: str = "~/.kube/config"
    TOKEN_EXPIRE_MINUTES: int = 480
    ALGORITHM: str = "HS256"

    class Config:
        env_file = ".env"
        env_prefix = "K8S_MANAGER_"


settings = Settings()
