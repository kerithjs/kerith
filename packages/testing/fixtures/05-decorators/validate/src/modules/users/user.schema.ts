export const createUserSchema = {
  parse(data: unknown) {
    const d = data as Record<string, unknown>;
    if (typeof d?.name !== 'string' || typeof d?.email !== 'string') {
      throw new Error('name and email must be strings');
    }
    return { name: d.name, email: d.email };
  },
};
