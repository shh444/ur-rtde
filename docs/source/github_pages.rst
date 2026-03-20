Publishing with Sphinx and GitHub Pages
=======================================

Local HTML build
----------------

Install Sphinx:

.. code-block:: powershell

   pip install -r ./docs/requirements.txt

Build HTML locally:

.. code-block:: powershell

   python -m sphinx -M html docs/source docs/build

Open the result:

.. code-block:: text

   docs/build/html/index.html

Repository workflow
-------------------

This repository includes a GitHub Actions workflow at ``.github/workflows/docs.yml``.

The workflow does the following:

1. checks out the repository,
2. installs Python,
3. installs ``docs/requirements.txt``,
4. builds Sphinx HTML,
5. uploads ``docs/build/html`` as a Pages artifact,
6. deploys the artifact with GitHub Pages.

Required GitHub repository setting
----------------------------------

In the repository settings, set **Pages** to use **GitHub Actions** as the source.

Minimal command summary
-----------------------

.. code-block:: text

   pip install -r docs/requirements.txt
   python -m sphinx -M html docs/source docs/build

What to commit
--------------

Commit these paths at minimum:

- ``README.md``
- ``docs/``
- ``.github/workflows/docs.yml``
- ``examples/``

You do not need to re-ship large mesh assets for documentation-only changes.
