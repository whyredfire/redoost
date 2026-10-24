import asyncio
from typing import Any

from src import storage
from src.config import settings


def test_limited_caps_how_many_run_at_once() -> None:
    running = 0
    most = 0

    async def call(value: int) -> int:
        nonlocal running, most
        running += 1
        most = max(most, running)
        await asyncio.sleep(0.001)
        running -= 1
        return value

    results = asyncio.run(storage.limited((call(i) for i in range(100)), limit=7))

    assert results == list(range(100))
    assert most == 7


def test_clients_give_up_before_the_gateway_does() -> None:
    async def read_config() -> Any:
        async with storage.client(settings.s3_endpoint) as s3:
            return s3.meta.config

    config = asyncio.run(read_config())
    assert config.max_pool_connections == storage.concurrency
    # Three tries at 15 seconds stay under the gateway's 60
    assert (config.connect_timeout, config.read_timeout) == (5, 15)
    assert config.retries["total_max_attempts"] == 3
