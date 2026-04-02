Title
PlasmaXAI: A Counterfactual-Guided Multi-Branch Fusion Framework for Malignant Plasma Cell Recognition and Patient-Level Morphologic Signature Analysis

Research Objectives
This study presents PlasmaXAI as an explainable computational pathology framework for malignant plasma cell recognition on PCMMD. The objectives are to improve discrimination against stronger benchmark models, integrate counterfactual information directly into the decision pathway, and identify an operating point that is clinically stronger on precision and recall while preserving high overall accuracy.

Proposed Methodology
PlasmaXAI combines frozen ResNet50 and DenseNet121 image embeddings with morphology, counterfactual, and score branches. Counterfactual signals modulate the image streams through sigmoid gates, refine the score stream, and contribute to a learned softmax modality gate before weighted fusion and final classification. For deployment, the model is now reported with a precision-recall balanced threshold selected from a stable validation performance plateau, improving both malignant-cell precision and malignant-cell recall relative to the strongest baselines.

Outcomes and Results
At the selected precision-recall balanced operating point (threshold 0.72), PlasmaXAI achieved 93.42% accuracy, 93.43% weighted F1, 91.24% plasma precision, 94.63% plasma recall, and 97.76% AUC on the held-out test set. The strongest non-PlasmaXAI baseline by accuracy was ResNet50 at 91.92%, the strongest non-PlasmaXAI baseline by precision was Prev Hybrid at 90.91%, and the strongest non-PlasmaXAI baseline by recall was ResNet50 at 93.80%. PlasmaXAI now leads the benchmark on accuracy, plasma precision, and plasma recall simultaneously. Bootstrap 95% intervals at this operating point were 91.16-95.30 for accuracy and 91.30-97.20 for plasma recall.

Patient-Level Robustness and Interpretation
The patient-level score using mean novel probability still produced an internal AUC of 1.000 on a cohort of only 10 patients. Exact permutation testing gave one-sided p=0.0040 and two-sided p=0.0079, while leave-one-patient-out AUC remained 1.000. These checks show strong internal separation, but because the cohort contains only ten same-source patients, the patient-level result should still be treated as exploratory and not as external clinical proof.

Impact Applications
With the updated operating point, PlasmaXAI is stronger for practical screening because it no longer trades malignant-cell recall for weak precision. The model now offers a more balanced and clinically usable error profile while preserving explainability through counterfactual features, modality gates, and patient-level signature analysis.

Diagrams
The report package includes the framework diagram, expanded benchmark comparison, precision/F1 comparison, training curves, confusion/ROC comparison, patient robustness figure, and patient signature heatmap.
