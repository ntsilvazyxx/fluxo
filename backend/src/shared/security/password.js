import argon2 from 'argon2';

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

export const hashPassword = (password) => argon2.hash(password, ARGON2_OPTIONS);

export const verifyPassword = async (passwordHash, password) => {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
};
