Sphinx 와 GitHub Pages 배포
===========================

.. raw:: html

   <div class="lang-switch">
     <a href="../en/github_pages.html">EN</a>
     <span class="active">KO</span>
   </div>


.. raw:: html

   

로컬 HTML 빌드
--------------

Sphinx 와 테마를 설치합니다.

.. code-block:: powershell

   pip install -r ./docs/requirements.txt

로컬에서 HTML을 빌드합니다.

.. code-block:: powershell

   python -m sphinx -M html docs/source docs/build

결과물을 엽니다.

.. code-block:: text

   docs/build/html/index.html

저장소 workflow
---------------

이 저장소에는 ``.github/workflows/docs.yml`` 경로에 GitHub Actions workflow가 포함되어 있습니다.

Workflow 동작 순서:

1. 저장소 checkout
2. Python 설치
3. ``docs/requirements.txt`` 설치
4. Sphinx HTML 빌드
5. ``docs/build/html`` 을 Pages artifact 로 업로드
6. GitHub Pages 로 배포

필수 GitHub 설정
-----------------

저장소 설정의 **Pages** 에서 source를 **GitHub Actions** 로 설정하세요.

최소 명령 요약
--------------

.. code-block:: text

   pip install -r docs/requirements.txt
   python -m sphinx -M html docs/source docs/build

커밋할 파일
-----------

최소한 아래 경로는 커밋하세요.

- ``README.md``
- ``docs/``
- ``.github/workflows/docs.yml``
- ``examples/``

문서만 수정한 경우 큰 mesh asset은 다시 포함하지 않아도 됩니다.
