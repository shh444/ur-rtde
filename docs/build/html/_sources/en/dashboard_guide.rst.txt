Web interface guide
===================

.. raw:: html

   <div class="lang-switch">
     <span class="active">EN</span>
     <a href="../ko/dashboard_guide.html">KO</a>
   </div>


.. raw:: html

   

Overview
--------

The web interface is intended for quick inspection and visualization. It combines:

- live values,
- joint and TCP charts,
- a mesh-based digital twin,
- GP register writes,
- current-window monitoring,
- event logs,
- CSV recording and snapshot export.

Screenshots
-----------

.. figure:: _static/screenshots/digital_twin.png
   :alt: Mesh-based digital twin view
   :width: 100%

   Mesh-based digital twin view.

.. figure:: _static/screenshots/current_window.png
   :alt: Joint current versus allowed window view
   :width: 100%

   Joint current versus allowed window monitor.

How to run it
-------------

.. code-block:: powershell

   python ./run_dashboard.py

Open the web interface in a browser:

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

The web interface includes time-history charts for joints, TCP, and current-window data. These are intended for operator understanding and debugging rather than raw archival.

Digital twin
^^^^^^^^^^^^

The digital twin follows ``actual_q``. When ``actual_TCP_pose`` is present, the UI can also show TCP-related overlays.

GP write panel
^^^^^^^^^^^^^^

If your configuration includes ``input_*_register_*`` fields, the web interface can write those GP inputs directly.

Current-window monitor
^^^^^^^^^^^^^^^^^^^^^^

If these fields are available:

- ``target_current``
- ``actual_current``
- ``actual_current_window``

then the web interface shows actual current, target current, allowed window, and a derived usage ratio per joint.

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
