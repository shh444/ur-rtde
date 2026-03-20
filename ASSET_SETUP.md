# Mesh asset setup

This patch does not include `robot_assets/`.

Install or verify the local mesh bundle with:

```powershell
python .\tools\install_robot_assets.py --zip .\meshes.zip
```

Check the currently installed assets without extracting again:

```powershell
python .\tools\install_robot_assets.py --check-only
```

Check only specific models:

```powershell
python .\tools\install_robot_assets.py --check-only --models ur10e ur16e ur20 ur30
```

After updating the frontend files, restart the dashboard and do a hard refresh in the browser:

```text
Ctrl + F5
```
