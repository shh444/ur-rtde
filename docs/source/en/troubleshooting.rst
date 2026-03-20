Troubleshooting
===============

.. raw:: html

   <div class="lang-switch">
     <span class="active">EN</span>
     <a href="../ko/troubleshooting.html">KO</a>
   </div>


.. raw:: html

   

Unsupported RTDE fields
-----------------------

Error example:

.. code-block:: text

   RTDE output setup contains unsupported fields: actual_current_as_torque:NOT_FOUND

Meaning:

The controller does not support one or more requested output fields.

Recommended fix order:

1. Remove the unsupported field.
2. Test again with a known-good slim recipe.
3. Add fields back one by one.

Known-good slim recipe:

.. code-block:: python

   ROBOT_FIELDS = ["timestamp", "actual_q", "actual_TCP_pose"]

Start rejected
--------------

Error example:

.. code-block:: text

   RTDEError: RTDE start rejected

Typical causes:

- invalid or unsupported recipe,
- frequency too ambitious for the selected field set,
- security or service access issue,
- controller-side resource pressure.

Practical fix order:

1. Reduce to ``125.0`` Hz.
2. Use ``timestamp``, ``actual_q``, ``actual_TCP_pose`` only.
3. Re-add extra fields one by one.

Actual rate drops over time
---------------------------

Common causes:

- too many fields at once,
- a 500 Hz recipe used for a full monitoring UI,
- charting and rendering load,
- controller-side packet skipping under load.

Practical fix:

- keep 500 Hz for the thinnest possible recipe,
- run richer monitoring at 125 Hz,
- separate the high-rate twin profile from the diagnostics profile.

GP write does not work
----------------------

Check all of these:

- are you writing to an ``input_*`` register rather than an ``output_*`` register?
- is another RTDE client already controlling that same input variable?
- is the field included in the active setup?

Digital twin visible but links are misaligned
---------------------------------------------

If the robot is visible but links appear connected in the wrong order, the most likely cause is a transform mismatch between imported mesh origins and the joint origin chain. Update only the front-end mesh loader and force a hard refresh in the browser.

Digital twin not visible
------------------------

Check the browser-side 3D debug log first. Useful indicators include:

- which mesh files were loaded,
- applied scale,
- bounding box size,
- fallback state.

Hard refresh after front-end changes:

.. code-block:: text

   Ctrl + F5
