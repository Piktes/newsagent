"""
Cross-thread notification helper.
The scheduler runs in a background thread; WebSocket sends are async.
We store the main event loop here so scheduler can schedule coroutines on it.
"""
import asyncio

_main_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


def notify_user_sync(user_id: int, message: dict) -> None:
    """Call from any thread to send a WebSocket notification to a user."""
    if _main_loop is None or not _main_loop.is_running():
        return
    try:
        from routers.notifications import send_notification
        asyncio.run_coroutine_threadsafe(
            send_notification(user_id, message),
            _main_loop,
        )
    except Exception:
        pass
