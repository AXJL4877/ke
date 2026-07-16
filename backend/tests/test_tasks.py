from api.schemas.task import TaskCreate


def test_task_create_schema():
    body = TaskCreate(module_id="echo", input_params={"message": "x"})
    assert body.module_id == "echo"
    assert body.input_params["message"] == "x"
