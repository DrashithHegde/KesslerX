import logging

from redis import Redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

try:
    redis_client = Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_timeout=5,
        socket_connect_timeout=5,
    )
except Exception as e:
    logger.error("Failed to initialize Redis client: %s", e)
    redis_client = None

def get_redis() -> Redis | None:
    return redis_client
