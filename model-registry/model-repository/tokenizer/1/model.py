import sys
sys.path.insert(0, "/tmp/pip_packages")

import numpy as np
import triton_python_backend_utils as pb_utils
from transformers import AutoTokenizer

class TritonPythonModel:
    def initialize(self, args):
        self.tokenizer = AutoTokenizer.from_pretrained(
            "sentence-transformers/all-MiniLM-L6-v2"
        )

    def execute(self, requests):
        responses = []
        for request in requests:
            text_tensor = pb_utils.get_input_tensor_by_name(request, "TEXT")
            print(f"DEBUG: Tensor Data Type = {text_tensor}", flush=True)
           
            
            try:
                raw_texts = text_tensor.as_numpy().flatten()
                print(f"DEBUG: Successfully unpacked raw_texts = {raw_texts}", flush=True)
            except Exception as e:
                print(f"DEBUG: as_numpy() crashed with error: {e}", flush=True)
                raise e
            
            texts = [
                t.decode("utf-8") if isinstance(t, bytes) else str(t)
                for t in raw_texts
            ]

            encoded = self.tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="np"
            )

            input_ids_tensor = pb_utils.Tensor(
                "input_ids", encoded["input_ids"].astype(np.int64)
            )
            attention_mask_tensor = pb_utils.Tensor(
                "attention_mask", encoded["attention_mask"].astype(np.int64)
            )
            token_type_ids_tensor = pb_utils.Tensor(
                "token_type_ids",
                encoded.get(
                    "token_type_ids", 
                    np.zeros_like(encoded["input_ids"])
                ).astype(np.int64)
            )

            responses.append(
                pb_utils.InferenceResponse(
                    output_tensors=[input_ids_tensor, attention_mask_tensor, token_type_ids_tensor]
                )
            )

        return responses

    def finalize(self):
        pass