import React from 'react';

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
  const getInitials = (name: string) => {
    if (!name) return '?';
    const nameParts = name.split(' ');
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const fallbackAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=333&color=fff&size=128`;

  const finalAvatarUrl = avatarUrl || fallbackAvatarUrl;

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