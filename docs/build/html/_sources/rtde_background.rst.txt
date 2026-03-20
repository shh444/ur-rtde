RTDE background
===============

What RTDE is
------------

RTDE is the Universal Robots Real-Time Data Exchange interface. In practice, it lets an external application synchronize selected robot data over TCP.

This project follows the official RTDE model closely:

- choose named output fields,
- optionally choose input fields,
- start the synchronization loop,
- read robot outputs and write controller inputs.

Why field names are kept literal
--------------------------------

The dashboard and the Python API deliberately use the real RTDE field names so that what you configure here matches the names in the official Universal Robots RTDE documentation.

Examples:

- ``timestamp``
- ``actual_q``
- ``actual_qd``
- ``actual_current``
- ``actual_TCP_pose``
- ``input_int_register_24``
- ``output_int_register_24``

Output recipe vs input recipe
-----------------------------

RTDE uses:

- **one output recipe** for robot-to-client streaming,
- **one or more input recipes** for client-to-controller writes.

In this project, you normally only have to think in terms of fields and whether they are readable or writable.

GP inputs vs GP outputs
-----------------------

The most important practical distinction is:

- ``input_*_register_*`` is writable from the client.
- ``output_*_register_*`` is readable from the client.

For external RTDE clients the commonly used ranges are:

- ``input_bit_register_64`` .. ``input_bit_register_127``
- ``input_int_register_24`` .. ``input_int_register_47``
- ``input_double_register_24`` .. ``input_double_register_47``
- ``output_bit_register_64`` .. ``output_bit_register_127``
- ``output_int_register_24`` .. ``output_int_register_47``
- ``output_double_register_24`` .. ``output_double_register_47``

Frequency and load
------------------

The dashboard can request high RTDE rates, but that does not mean every visualization layer should try to consume every frame.

Practical rule of thumb:

- use **500 Hz** only with a slim field list,
- use **125 Hz** for richer monitoring,
- add current, GP, and diagnostics fields only when you need them.

Current-window safety view
--------------------------

To compare measured current against the allowed deviation window, request these fields together:

.. code-block:: python

   ROBOT_FIELDS = [
       "timestamp",
       "target_current",
       "actual_current",
       "actual_current_window",
   ]

The dashboard derives a practical ratio:

.. code-block:: text

   usage = abs(actual_current - target_current) / actual_current_window

That ratio is a monitoring aid, not a certified safety function.
