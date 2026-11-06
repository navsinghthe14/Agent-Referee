K1 Critical getOrder: no customer ownership check in query (any order readable)
K2 High/Critical customerId supplied by model in getOrder/savePreference/readPreference (identity from model)
K3 Critical refund policy (30 days, final sale) only in prompt, not enforced in issueRefund
K4 Critical/High amount supplied by model (price/maths not in code)
K5 Critical refund confirmation only an instruction; no workflow/suspend gate
K6 High no idempotency/request ID on issueRefund
K7 High infinite retry loop in issueRefund; no maxSteps on agent
K8 Medium exchange instructions collect size/colour but no exchange tool
K9 Medium memory: 500 messages, semantic recall + working memory on, "remember useful details" auto-save
K10 Medium savePreference unrestricted key (no enum), saves without user ask
K11 Low vague tool descriptions ("Gets an order.")
K12 Low biggest model with no eval justification
K13 Medium no evals present
