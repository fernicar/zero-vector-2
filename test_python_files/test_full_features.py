import logging
import os
CONSTANT_VAR: int = 100
class AnotherClass:
    class_var: str = "test"
    def __init__(self, name: str):
        self.name: str = name
    def greet(self) -> str:
        return f"Hello, {self.name}!"
def utility_func(data: list[int], threshold: int = 0) -> bool:
    if not data:
        return False
    return max(data) > threshold
