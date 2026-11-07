import json, sys
sys.path.insert(0, "C:/furnus/services/kernel")
from furnus_kernel import sandbox
s = open("C:/furnus/docs/ARCHITECTURE.md", encoding="utf-8").read()
codigo = s.split("```python")[1].split("```")[0]
r = sandbox.ejecutar({"script": codigo, "parametros": {"largo": 80}, "salidas": ["malla", "medidas", "step"]})
print(json.dumps(r, indent=1, ensure_ascii=False))
