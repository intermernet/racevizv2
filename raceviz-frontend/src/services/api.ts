// The base URL for all API requests. It reads from a Vite environment variable.
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * A generic helper function for making API requests to PUBLIC endpoints.
 * It does not include an authentication token.
 * It intelligently handles the Content-Type header based on the body type.
 *
 * @param endpoint The API endpoint to call (e.g., '/users/login').
 * @param options The standard options for the `fetch` request.
 * @returns The JSON response from the server, cast to the expected type `T`.
 */
export async function publicFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Use the Headers class for robust, type-safe header manipulation.
  const headers = new Headers(options.headers || {});

  // Check if the body is FormData. If it is, DO NOT set the Content-Type header.
  // The browser needs to set it automatically to include the multipart boundary.
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Make the API call using the native fetch API.
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers, // Pass the constructed Headers object.
  });

  // Attempt to parse the response as JSON.
  const data = await response.json();

  // If the response status is not OK (e.g., 4xx or 5xx), throw an error.
  if (!response.ok) {
    // The backend sends errors in a standard format, e.g., { "error": "message" }.
    // We use that message if available, otherwise provide a generic error.
    throw new Error(data.error || 'An unknown API error occurred.');
  }

  return data;
}


/**
 * A generic helper function for making API requests to PROTECTED endpoints.
 * It automatically includes the JWT token from localStorage and handles Content-Type.
 *
 * @param endpoint The API endpoint to call (e.g., '/users/me').
 * @param options The standard options for the `fetch` request.
 * @returns The JSON response from the server, cast to the expected type `T`.
 */
export async function authenticatedFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Intelligently set Content-Type, same as in publicFetch.
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Retrieve the auth token from local storage.
  const token = localStorage.getItem('authToken');
  if (token) {
    // If a token exists, add the Authorization header.
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    // If no token exists for an authenticated request, we can throw an error
    // immediately to prevent an unnecessary and guaranteed-to-fail API call.
    throw new Error('Authentication token not found.');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  const data = await response.json();

  if (!response.ok) {
    // A 401 Unauthorized error often means the token is expired or invalid.
    // A robust UX pattern is to automatically log the user out in this case.
    if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/'; // Redirect to the login page
    }
    throw new Error(data.error || 'An authenticated API error occurred.');
  }

  return data;
}

export async function updateRacerColor(
  groupId: number,
  eventId: number,
  racerId: number,
  color: string
) {
  return authenticatedFetch(
    `/groups/${groupId}/events/${eventId}/racers/${racerId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ color }),
    }
  );
}