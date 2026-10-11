from vaada.logs import _before_send


def test_error_reports_carry_no_frame_variables_request_body_or_user() -> None:
    event = {
        "request": {"data": {"pan": "ABCPR1234K"}, "headers": {"Authorization": "Bearer x"}, "url": "/payouts"},
        "user": {"email": "aditi@example.in"},
        "exception": {
            "values": [
                {
                    "value": "failed for aditi@example.in",
                    "stacktrace": {"frames": [{"function": "_call", "vars": {"args": "{'legal_info': {'pan': 'X'}}"}}]},
                }
            ]
        },
    }
    sent = _before_send(event, None)
    assert "data" not in sent["request"] and "headers" not in sent["request"]
    assert "user" not in sent
    frame = sent["exception"]["values"][0]["stacktrace"]["frames"][0]
    assert "vars" not in frame
    assert "aditi@example.in" not in sent["exception"]["values"][0]["value"]
