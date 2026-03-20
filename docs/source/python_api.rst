Python API
==========

There are two user-facing ways to use this repository from Python.

Simple wrapper: ``UR_RTDE``
---------------------------

The small wrapper class is designed to be easy to read and easy to copy into application code.

.. literalinclude:: ../../examples/class_api_example.py
   :language: python
   :caption: Synchronous ``UR_RTDE`` example

Core class: ``URRobot``
-----------------------

``URRobot`` exposes the lower-level interface used internally by the dashboard. Use it when you want a slightly more explicit API.

Typical construction:

.. code-block:: python

   from backend.ur_robot import URRobot

   robot = URRobot(
       host="192.168.163.128",
       frequency_hz=125.0,
       fields=["timestamp", "actual_q", "actual_TCP_pose"],
   )

Async example
-------------

.. literalinclude:: ../../examples/class_api_async_example.py
   :language: python
   :caption: Async ``URRobot`` example

Reading values
--------------

Both APIs let you read the latest cached value by name:

.. code-block:: python

   print(robot["actual_q"])
   print(robot["actual_TCP_pose"])

Writing GP inputs
-----------------

Write only to ``input_*_register_*`` fields:

.. code-block:: python

   robot["input_int_register_24"] = 33
   robot["input_double_register_24"] = 12.5
   robot["input_bit_register_64"] = True

Conversion helpers
------------------

Useful convenience helpers for display and debugging:

.. code-block:: python

   print(robot.q_deg())
   print(robot.tcp_mm())
   print(robot.tcp_mm_deg())
   print(robot.tcp_rpy())
   print(robot.tcp_rpy_deg())

Suggested integration pattern
-----------------------------

For larger applications:

- keep one robot object per robot connection,
- choose the smallest field list that satisfies the application,
- use the dashboard for inspection,
- use the Python API for automation and logging.
