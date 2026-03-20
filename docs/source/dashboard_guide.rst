Dashboard guide
===============

Overview
--------

The web dashboard is intended for quick inspection and visualization. It combines:

- live values,
- joint and TCP charts,
- a mesh-based digital twin,
- GP register writes,
- current-window monitoring,
- event logs,
- CSV recording and snapshot export.

How to run it
-------------

.. code-block:: powershell

   python ./run_dashboard.py

Open the dashboard in a browser:

.. code-block:: text

   http://127.0.0.1:8008

Key panels
----------

Status cards
^^^^^^^^^^^^

The top section shows the configured host, requested RTDE frequency, active read rate, and live connection state.

Live values
^^^^^^^^^^^

The live table shows the most recent value of each configured RTDE field. The field names remain close to the official RTDE names.

Charts
^^^^^^

The dashboard includes time-history charts for joints, TCP, and current-window data. These are intended for operator understanding and debugging rather than raw archival.

Digital twin
^^^^^^^^^^^^

The digital twin follows ``actual_q``. When ``actual_TCP_pose`` is present, the UI can also show TCP-related overlays.

GP write panel
^^^^^^^^^^^^^^

If your configuration includes ``input_*_register_*`` fields, the dashboard can write those GP inputs directly.

Current-window monitor
^^^^^^^^^^^^^^^^^^^^^^

If these fields are available:

- ``target_current``
- ``actual_current``
- ``actual_current_window``

then the dashboard shows actual current, target current, allowed window, and a derived usage ratio per joint.

Recommended field profiles
--------------------------

Digital twin only:

.. code-block:: python

   ROBOT_FIELDS = ["timestamp", "actual_q", "actual_TCP_pose"]

Digital twin + I/O:

.. code-block:: python

   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_TCP_pose",
       "actual_digital_input_bits",
       "actual_digital_output_bits",
   ]

Current-window monitor:

.. code-block:: python

   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_TCP_pose",
       "target_current",
       "actual_current",
       "actual_current_window",
   ]
