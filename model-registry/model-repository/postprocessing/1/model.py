import numpy as np
import triton_python_backend_utils as pb_utils

class TritonPythonModel:
    def initialize(self, args):
        pass

    def execute(self, requests):
        responses = []
        for request in requests:
            # Retrieve last_hidden_state and attention_mask tensors
            hidden_state_tensor = pb_utils.get_input_tensor_by_name(
                request, "last_hidden_state"
            )
            attention_mask_tensor = pb_utils.get_input_tensor_by_name(
                request, "attention_mask"
            )

            last_hidden_state = hidden_state_tensor.as_numpy()  # Shape: [batch_size, seq_len, 384]
            attention_mask = attention_mask_tensor.as_numpy()  # Shape: [batch_size, seq_len]

            # 1. Mean Pooling (ignoring padded tokens)
            input_mask_expanded = np.expand_dims(attention_mask, -1).astype(np.float32)
            sum_embeddings = np.sum(last_hidden_state * input_mask_expanded, axis=1)
            sum_mask = np.clip(input_mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
            mean_pooled = sum_embeddings / sum_mask

            # 2. L2 Normalization (produces unit vectors for cosine similarity)
            norms = np.linalg.norm(mean_pooled, axis=1, keepdims=True)
            norms = np.where(norms == 0, 1e-12, norms)
            embeddings = mean_pooled / norms

            # Package result as FP32 Tensor
            embeddings_tensor = pb_utils.Tensor(
                "embeddings", embeddings.astype(np.float32)
            )

            responses.append(
                pb_utils.InferenceResponse(output_tensors=[embeddings_tensor])
            )

        return responses

    def finalize(self):
        pass