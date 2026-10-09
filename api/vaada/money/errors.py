class MoneyError(Exception):
    """A request the money module refuses, with a message fit to show the person who made it."""

    def __init__(self, message: str, *, status_code: int = 409, code: str = "not_allowed") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class NotFoundError(MoneyError):
    def __init__(self, what: str = "That") -> None:
        super().__init__(f"{what} doesn't exist, or you can't see it.", status_code=404, code="not_found")


class ForbiddenError(MoneyError):
    def __init__(self, message: str = "Only a party to this deed can do that.") -> None:
        super().__init__(message, status_code=403, code="forbidden")


GATEWAY_DOWN = "We couldn't reach Razorpay just now, so nothing has changed. Try again in a minute."


class GatewayTroubleError(MoneyError):
    def __init__(self, message: str = GATEWAY_DOWN) -> None:
        super().__init__(message, status_code=502, code="gateway_unavailable")
