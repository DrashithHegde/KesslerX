import os
from dotenv import load_dotenv

load_dotenv()
from app.ml.debris_model import debris_model

res = debris_model.get_uncertainty_score("2741")
print(res)
