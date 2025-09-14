import React from 'react';

// Get the API base URL from environment variables to construct full image paths.
const API_BASE_URL = import.meta.env.VITE_API_URL;

interface UserAvatarProps {
  avatarUrl: string | null | undefined;
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A component that displays a user's avatar image.
 * If the avatarUrl is not provided, it generates a fallback avatar
 * with the user's initials.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({ avatarUrl, name, className, style }) => {
  const fallbackAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=333&color=fff&size=128`;

  let finalAvatarUrl = avatarUrl || fallbackAvatarUrl;

  // If the avatarUrl is a relative path from our backend, prepend the API base URL.
  // This check prevents prepending the URL to external URLs (like from Google OAuth).
  if (avatarUrl && avatarUrl.startsWith('/')) {
    // Construct the URL for the static file server, which is at the root of the domain,
    // not under the /api/v1 prefix.
    finalAvatarUrl = `${API_BASE_URL.replace('/api/v1', '')}${avatarUrl}`;
  }

  return (
    <img
      src={finalAvatarUrl}
      alt={`${name}'s avatar`}
      className={className}
      style={style}
      onError={(e) => { e.currentTarget.src = fallbackAvatarUrl; }} // Fallback if the provided URL fails
    />
  );
};