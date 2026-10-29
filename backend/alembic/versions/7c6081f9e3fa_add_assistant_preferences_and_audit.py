"""add_assistant_preferences_and_audit

Revision ID: 7c6081f9e3fa
Revises: 6a5c74509af8
Create Date: 2026-10-16 09:35:13.106944

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c6081f9e3fa'
down_revision: Union[str, Sequence[str], None] = '6a5c74509af8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: Create assistant_audit_logs and assistant_preferences."""
    op.create_table(
        'assistant_audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.String(length=100), nullable=False),
        sa.Column('action_type', sa.String(length=100), nullable=False),
        sa.Column('permission_level_required', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('parameters', sa.Text(), nullable=True),
        sa.Column('result_summary', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assistant_audit_logs_conversation_id'), 'assistant_audit_logs', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_assistant_audit_logs_user_id'), 'assistant_audit_logs', ['user_id'], unique=False)

    op.create_table(
        'assistant_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('permission_level', sa.Integer(), nullable=False),
        sa.Column('voice_enabled', sa.Boolean(), nullable=False),
        sa.Column('voice_name', sa.String(length=100), nullable=True),
        sa.Column('activation_shortcut', sa.String(length=50), nullable=False),
        sa.Column('context_sharing_enabled', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assistant_preferences_user_id'), 'assistant_preferences', ['user_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema: Drop assistant_preferences and assistant_audit_logs."""
    op.drop_index(op.f('ix_assistant_preferences_user_id'), table_name='assistant_preferences')
    op.drop_table('assistant_preferences')
    op.drop_index(op.f('ix_assistant_audit_logs_user_id'), table_name='assistant_audit_logs')
    op.drop_index(op.f('ix_assistant_audit_logs_conversation_id'), table_name='assistant_audit_logs')
    op.drop_table('assistant_audit_logs')
