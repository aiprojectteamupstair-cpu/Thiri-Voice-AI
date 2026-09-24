export async function readApiJson(response: Response): Promise<any> {
  const body = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`Thiri server returned HTTP ${response.status} instead of JSON. Check the deployed API function and its logs.`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Thiri server returned invalid JSON (HTTP ${response.status}).`);
  }
}
