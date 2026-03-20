Getting started
===============

.. raw:: html

   <div class="lang-switch">
     <span class="active">EN</span>
     <a href="../ko/getting_started.html">KO</a>
   </div>


.. raw:: html

   

Windows setup
-------------

Create and activate a virtual environment:

.. code-block:: powershell

   py -3 -m venv .venv
   ./.venv/Scripts/Activate.ps1
   python -m pip install --upgrade pip
   pip install -r ./backend/requirements.txt

Start the web interface:

.. code-block:: powershell

   python ./run_dashboard.py

Open the browser UI:

.. code-block:: text

   http://127.0.0.1:8008

Single-source configuration
---------------------------

Edit only ``app_config.py`` for the robot IP and the default RTDE setup.

.. code-block:: python

   ROBOT_HOST = "192.168.163.128"
   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_MODEL = "ur5e"
   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_TCP_pose",
   ]

Recommended starting points
---------------------------

High-rate digital twin:

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 500.0
   ROBOT_FIELDS = ["timestamp", "actual_q", "actual_TCP_pose"]

Web interface monitoring:

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_qd",
       "actual_TCP_pose",
       "actual_TCP_speed",
       "runtime_state",
       "speed_scaling",
   ]

Current-window monitoring:

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "target_current",
       "actual_current",
       "actual_current_window",
   ]

.. note::

   Start with the thinnest field list that satisfies your use case. Increase frequency last,
   not first.
